/**
 * The `createSubtask` tool. Agents file a child task assigned to another
 * agent (or a human) and continue. Subtasks are fire-and-forget — the
 * parent agent does not wait. The newly-created task wakes the worker
 * independently if its assignee is an agent.
 */

import {tool, ToolSet} from 'ai';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {z} from 'zod';
import {loadAgents} from './registry.js';
import {AGENT_ASSIGNEE_PREFIX, type AgentRunContext} from './run-context.js';

const TASK_COUNTER_ID = 'tasks';
const TASK_ID_ALLOCATION_ATTEMPTS = 20;

/**
 * Builds the `createSubtask` tool. The execute function creates a new task
 * record under the same project, links it to the parent, and returns the
 * new task id.
 */
export function createSubtaskTool(ctx: AgentRunContext): ToolSet {
  return {
    createSubtask: tool({
      description:
        'File a subtask under the current task and assign it to another ' +
        'agent or a human. Subtasks are fire-and-forget — the parent does ' +
        'not block. Use this when work needs human visibility between ' +
        'agents (e.g. handing translation off to a localization agent).',
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        assigneeAgent: z
          .string()
          .optional()
          .describe(
            'Name of an agent to assign the subtask to (without the ' +
              '"agent:" prefix). Mutually exclusive with `assigneeEmail`.'
          ),
        assigneeEmail: z
          .string()
          .optional()
          .describe(
            'Email of a human to assign the subtask to. Mutually exclusive ' +
              'with `assigneeAgent`.'
          ),
        priority: z.enum(['high', 'medium', 'normal']).default('normal'),
      }),
      execute: async (input) => {
        if (input.assigneeAgent && input.assigneeEmail) {
          throw new Error(
            'createSubtask: pass at most one of assigneeAgent or assigneeEmail'
          );
        }
        const assignee = await resolveAssignee(ctx, input);
        const subtaskId = await allocateAndCreateSubtask(ctx, {
          title: input.title,
          description: input.description,
          assignee,
          priority: input.priority,
        });
        return {ok: true, taskId: subtaskId};
      },
    }),
  };
}

interface CreateSubtaskInput {
  title: string;
  description?: string;
  assignee: string | null;
  priority: 'high' | 'medium' | 'normal';
}

async function resolveAssignee(
  ctx: AgentRunContext,
  input: {
    assigneeAgent?: string;
    assigneeEmail?: string;
  }
): Promise<string | null> {
  if (input.assigneeAgent) {
    // Pass the run context's vite server through so the registry resolves
    // `virtual:root/agents` correctly in dev. Without this, every agent
    // name reads as "unknown" and createSubtask bounces with
    // "unknown agent" — the same hiccup we hit on the API endpoints
    // earlier in this stack.
    const agents = await loadAgents({viteServer: ctx.viteServer});
    if (!agents.has(input.assigneeAgent)) {
      const known = Array.from(agents.keys()).join(', ') || '(none)';
      throw new Error(
        `createSubtask: unknown agent "${input.assigneeAgent}" ` +
          `(known: ${known})`
      );
    }
    return `${AGENT_ASSIGNEE_PREFIX}${input.assigneeAgent}`;
  }
  if (input.assigneeEmail) {
    return input.assigneeEmail.toLowerCase();
  }
  return null;
}

async function allocateAndCreateSubtask(
  ctx: AgentRunContext,
  input: CreateSubtaskInput
): Promise<string> {
  const counterRef = ctx.db.doc(
    `Projects/${ctx.projectId}/Counters/${TASK_COUNTER_ID}`
  );
  const tasksCol = ctx.db.collection(`Projects/${ctx.projectId}/Tasks`);
  return ctx.db.runTransaction(async (txn) => {
    const counterSnap = await txn.get(counterRef);
    const counterData = counterSnap.data() || {};
    const lastTaskId =
      typeof counterData.lastTaskId === 'number' ? counterData.lastTaskId : 0;
    let nextTaskId = Math.floor(lastTaskId) + 1;

    for (let i = 0; i < TASK_ID_ALLOCATION_ATTEMPTS; i++) {
      const taskRef = tasksCol.doc(String(nextTaskId));
      const taskSnap = await txn.get(taskRef);
      if (!taskSnap.exists) {
        const isAgentAssignee = (input.assignee || '').startsWith(
          AGENT_ASSIGNEE_PREFIX
        );
        txn.set(
          counterRef,
          {lastTaskId: nextTaskId, updatedAt: FieldValue.serverTimestamp()},
          {merge: true}
        );
        txn.set(taskRef, {
          id: String(nextTaskId),
          title: input.title,
          description: input.description || '',
          assignee: input.assignee,
          priority: input.priority,
          status: 'new',
          targetLaunchDate: null,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: ctx.createdBy,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.createdBy,
          parentTaskId: ctx.taskId,
          ...(isAgentAssignee
            ? {
                agentRun: {
                  status: 'idle',
                  tokensUsed: 0,
                  updatedAt: FieldValue.serverTimestamp(),
                },
              }
            : {}),
        });
        return String(nextTaskId);
      }
      nextTaskId += 1;
    }
    throw new Error('createSubtask: unable to allocate a task id');
  });
}

export {Timestamp};
