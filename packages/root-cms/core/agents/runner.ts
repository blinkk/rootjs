/**
 * Agent runner. Executes a single agent run for a task to completion (or
 * until budget/cancel/error halts it). Workers wrap this with the
 * lease/queue plumbing; tests can call it directly with a stubbed CMS
 * client.
 *
 * The runner does NOT stream to a browser — runs are background work. Each
 * step's tool calls update Firestore (proposals, reactions, subtasks);
 * the UI subscribes to those for live progress.
 */

import {generateText, stepCountIs, ToolSet} from 'ai';
import {resolveLanguageModel, type AiModelConfig} from '../ai-chat.js';
import {TokenBudget} from './budget.js';
import {getLinkingConventions} from './conventions.js';
import type {AgentRunContext} from './run-context.js';
import {
  addAgentReaction,
  postAgentStatusComment,
  updateAgentRunStatus,
} from './task-helpers.js';
import {createProposeTool} from './tools-propose.js';
import {createServerReadTools} from './tools-server.js';
import {createSubtaskTool} from './tools-subtask.js';
import type {AgentDefinition, AgentToolBundle} from './types.js';

/** Default per-task token cap when neither the agent nor the project sets one. */
export const DEFAULT_MAX_TOKENS_PER_TASK = 200_000;

/** Default maximum loop steps a single agent run will take. */
export const DEFAULT_MAX_STEPS = 25;

export interface RunAgentOptions {
  /** Resolved run context (CMS client, db, agent, taskId, identity, signal). */
  ctx: AgentRunContext;
  /** Resolved model config used for the language model. */
  model: AiModelConfig;
  /** First-turn user prompt. Typically the task title + description. */
  prompt: string;
  /**
   * Optional per-run cap; defaults to `agent.maxTokensPerTask` and finally
   * to `DEFAULT_MAX_TOKENS_PER_TASK`.
   */
  maxTokens?: number;
  /** Optional per-run loop-step cap. Defaults to `DEFAULT_MAX_STEPS`. */
  maxSteps?: number;
}

export type AgentRunOutcome =
  | {status: 'completed'; tokensUsed: number; text: string}
  | {status: 'cancelled'; tokensUsed: number}
  | {status: 'errored'; tokensUsed: number; error: string};

/**
 * Runs the agent loop end-to-end. Posts a starter 👀 comment, runs the
 * tool loop, and posts a terminal ✅/⚠️/❌ reaction depending on the
 * outcome. Updates `agentRun.status` on the task throughout.
 */
export async function runAgent(
  options: RunAgentOptions
): Promise<AgentRunOutcome> {
  const {ctx, model, prompt} = options;
  const tokensCap =
    options.maxTokens ??
    ctx.agent.maxTokensPerTask ??
    DEFAULT_MAX_TOKENS_PER_TASK;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const budget = new TokenBudget(tokensCap);

  const tools = buildAgentToolset(ctx, ctx.agent.allowedTools);
  const languageModel = resolveLanguageModel(model);

  const starterId = await postAgentStatusComment(
    ctx,
    `${ctx.agent.icon} ${ctx.agent.name} picked up this task.`,
    '👀'
  );
  await updateAgentRunStatus(ctx, {
    status: 'running',
    tokensUsed: 0,
    tokensCap,
  });

  let cancelled = false;
  let lastError: string | null = null;
  let finalText = '';

  try {
    const result = await generateText({
      model: languageModel,
      system: `${ctx.agent.systemPrompt}\n\n${getLinkingConventions()}`,
      prompt,
      tools,
      stopWhen: ({steps}: {steps: Array<Record<string, unknown>>}) => {
        if (steps.length >= maxSteps) {
          return true;
        }
        // Stop the run as soon as the agent posts a reply — that's the
        // explicit "I'm handing this back" signal. Without this the model
        // may keep iterating after the handoff comment, defeating the
        // purpose of `task_reply.reassign: true`.
        const last = steps[steps.length - 1] as
          | {toolCalls?: Array<{toolName: string}>}
          | undefined;
        return Boolean(
          last?.toolCalls?.some((tc) => tc.toolName === 'task_reply')
        );
      },
      abortSignal: ctx.signal,
      onStepFinish: async (step) => {
        budget.consume(step.usage);
        if (budget.isExceeded()) {
          // Surface as an error post-loop; halt by throwing.
          throw new Error(
            `agent[${ctx.agent.name}]: token budget exceeded ` +
              `(${budget.used}/${budget.cap})`
          );
        }
        if (ctx.signal?.aborted) {
          cancelled = true;
        }
      },
    });
    finalText = result.text || '';
  } catch (err) {
    if (ctx.signal?.aborted) {
      cancelled = true;
    } else {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (cancelled) {
    await addAgentReaction(ctx, starterId, '⚠️');
    await updateAgentRunStatus(ctx, {
      status: 'cancelled',
      tokensUsed: budget.used,
      lastError: null,
      leasedBy: null,
      leasedAt: null,
    });
    return {status: 'cancelled', tokensUsed: budget.used};
  }

  if (lastError) {
    await addAgentReaction(ctx, starterId, '❌');
    await updateAgentRunStatus(ctx, {
      status: 'errored',
      tokensUsed: budget.used,
      lastError,
      leasedBy: null,
      leasedAt: null,
    });
    return {status: 'errored', tokensUsed: budget.used, error: lastError};
  }

  await addAgentReaction(ctx, starterId, '✅');
  // Important: set a terminal status (`completed`) so the worker's
  // `where('agentRun.status', '==', 'idle')` listener does not immediately
  // re-claim and re-run the same task in a loop. The human moves it back
  // to `idle` via Retry or by reassigning to an agent.
  await updateAgentRunStatus(ctx, {
    status: 'completed',
    tokensUsed: budget.used,
    lastError: null,
    leasedBy: null,
    leasedAt: null,
  });
  return {status: 'completed', tokensUsed: budget.used, text: finalText};
}

/**
 * Builds the ToolSet exposed to an agent based on its granted bundles.
 * Bundle membership is fixed in code (not user-configurable) so granting
 * `'read'` always confers exactly the documented read tools.
 */
export function buildAgentToolset(
  ctx: AgentRunContext,
  bundles: AgentToolBundle[]
): ToolSet {
  const out: ToolSet = {};
  if (bundles.includes('read')) {
    Object.assign(out, createServerReadTools(ctx));
  }
  if (bundles.includes('propose')) {
    Object.assign(out, createProposeTool(ctx));
  }
  if (bundles.includes('subtask')) {
    Object.assign(out, createSubtaskTool(ctx));
  }
  return out;
}

/**
 * Runs the agent loop against an arbitrary prompt without touching the
 * task — used when an agent is invoked as a sub-agent (tool-call subagent
 * pattern from ai-sdk's docs). Returns the final text plus token usage so
 * the caller can summarize via `toModelOutput` if desired.
 */
export async function runAgentSubcall(
  ctx: AgentRunContext,
  agent: AgentDefinition,
  prompt: string,
  model: AiModelConfig,
  maxSteps = DEFAULT_MAX_STEPS
): Promise<{text: string; tokensUsed: number}> {
  const subCtx: AgentRunContext = {...ctx, agent};
  const tools = buildAgentToolset(subCtx, agent.allowedTools);
  const languageModel = resolveLanguageModel(model);
  const budget = new TokenBudget(agent.maxTokensPerTask ?? null);
  const result = await generateText({
    model: languageModel,
    system: `${agent.systemPrompt}\n\n${getLinkingConventions()}`,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: ctx.signal,
    onStepFinish: (step) => {
      budget.consume(step.usage);
    },
  });
  return {text: result.text || '', tokensUsed: budget.used};
}
