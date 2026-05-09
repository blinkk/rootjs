/**
 * Persistent in-process agent worker. Runs in the same Node process that
 * serves the CMS, listening for tasks with `agentRun.status: 'idle'` and an
 * `agent:*` assignee, then leases and runs them via `runAgent()`.
 *
 * Designed for hosting targets that keep the Node process warm: Cloud Run
 * with `min-instances >= 1`, App Engine Flex, GKE, or VMs. Does NOT work on
 * App Engine Standard or short-lived Cloud Functions where the process
 * terminates between requests; those targets need a Firestore-trigger
 * variant (out of scope for v0; see the design doc).
 */

import {randomUUID} from 'node:crypto';
import type {RootConfig} from '@blinkk/root';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {findModel, getAiConfig, type AiConfig} from '../ai-chat.js';
import type {CMSCheck} from '../checks.js';
import {RootCMSClient, getCmsPlugin} from '../client.js';
import {loadAgents} from './registry.js';
import {AGENT_ASSIGNEE_PREFIX, type AgentRunContext} from './run-context.js';
import {runAgent} from './runner.js';
import type {AgentDefinition} from './types.js';

/** How long a worker can hold a task lease before another worker may steal it. */
export const LEASE_TTL_MS = 15 * 60 * 1000;

export interface AgentWorkerOptions {
  /**
   * Stable identifier for this worker instance. Defaults to a per-process
   * UUID. Used as the lease holder so dead replicas can be detected.
   */
  instanceId?: string;
  /**
   * Maximum concurrent agent runs per process. Defaults to 3 — enough to
   * keep a hot model warm, low enough to bound memory.
   */
  maxConcurrent?: number;
  /**
   * Override hook for tests: if provided, called instead of `runAgent`.
   */
  runner?: typeof runAgent;
  /**
   * Optional override for the CMS checks exposed to agent runs. When
   * omitted, the worker reads them from the registered CMS plugin config.
   * Tests pass an explicit list to avoid spinning up the plugin.
   */
  checks?: CMSCheck[];
  /**
   * Vite dev server used to resolve `virtual:root/agents` in dev. Captured
   * from the first request that triggers `ensureAgentWorker`. Omit in prod;
   * the registry falls back to the standard dynamic import.
   */
  viteServer?: import('vite').ViteDevServer;
}

/**
 * In-process agent worker. Construct one per CMS server process and call
 * `start()`. Idempotent — calling `start()` twice is a no-op.
 */
export class AgentWorker {
  readonly instanceId: string;
  private readonly rootConfig: RootConfig;
  private readonly cmsClient: RootCMSClient;
  private readonly aiConfig: AiConfig;
  private readonly maxConcurrent: number;
  private readonly runner: typeof runAgent;
  private readonly checks: CMSCheck[];
  private viteServer?: import('vite').ViteDevServer;
  private unsubscribe: (() => void) | null = null;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(rootConfig: RootConfig, options: AgentWorkerOptions = {}) {
    this.instanceId = options.instanceId || randomUUID();
    this.rootConfig = rootConfig;
    this.cmsClient = new RootCMSClient(rootConfig);
    const aiConfig = getAiConfig(rootConfig);
    if (!aiConfig) {
      throw new Error(
        'AgentWorker: AI config is missing. The worker requires an AI model ' +
          'so it can run the agent loop.'
      );
    }
    this.aiConfig = aiConfig;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 3);
    this.runner = options.runner ?? runAgent;
    this.checks = options.checks ?? readChecksFromPlugin(rootConfig);
    this.viteServer = options.viteServer;
  }

  /**
   * Updates the captured Vite dev server. Used by the lazy startup path so a
   * later request that has `req.viteServer` can supply it even though the
   * first request didn't.
   */
  setViteServer(viteServer: import('vite').ViteDevServer | undefined) {
    if (viteServer) {
      this.viteServer = viteServer;
    }
  }

  /**
   * Subscribes to the Tasks collection and starts processing. Safe to call
   * multiple times — extra calls are no-ops.
   */
  start(): void {
    if (this.unsubscribe) {
      return;
    }
    const tasksRef = this.cmsClient.db.collection(
      `Projects/${this.cmsClient.projectId}/Tasks`
    );
    // Filter on the run status server-side. Agent-only filtering happens
    // in the snapshot handler since Firestore can't string-prefix-match
    // alongside an equality on another field without a composite index.
    const query = tasksRef.where('agentRun.status', '==', 'idle');
    this.unsubscribe = query.onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === 'removed') {
            continue;
          }
          this.maybeProcess(change.doc.id, change.doc.data());
        }
      },
      (err) => {
        console.error(`[AgentWorker:${this.instanceId}] snapshot error:`, err);
      }
    );
  }

  /** Tears down the listener. In-flight runs continue to completion. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /** Returns the count of in-flight runs on this worker. Test helper. */
  inflightCount(): number {
    return this.inflight.size;
  }

  private maybeProcess(taskId: string, data: Record<string, unknown>): void {
    if (this.inflight.has(taskId)) {
      return;
    }
    if (this.inflight.size >= this.maxConcurrent) {
      // Dropped pickup — another snapshot tick will re-deliver this task
      // once a slot frees up.
      return;
    }
    const assignee = String(data.assignee || '');
    if (!assignee.startsWith(AGENT_ASSIGNEE_PREFIX)) {
      return;
    }
    const promise = this.processTask(taskId, assignee).catch((err) => {
      console.error(
        `[AgentWorker:${this.instanceId}] task ${taskId} failed:`,
        err
      );
    });
    this.inflight.set(taskId, promise);
    void promise.finally(() => {
      this.inflight.delete(taskId);
    });
  }

  private async processTask(taskId: string, assignee: string): Promise<void> {
    const agentName = assignee.slice(AGENT_ASSIGNEE_PREFIX.length);
    const agents = await loadAgents({viteServer: this.viteServer});
    const agent = agents.get(agentName);
    if (!agent) {
      await this.markTaskErrored(
        taskId,
        `agent "${agentName}" is not registered`,
        assignee
      );
      return;
    }
    const claimed = await this.claim(taskId);
    if (!claimed) {
      return;
    }
    await this.runClaimedTask(taskId, agent, assignee);
  }

  private async claim(taskId: string): Promise<boolean> {
    const taskRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${taskId}`
    );
    return this.cmsClient.db.runTransaction(async (txn) => {
      const snap = await txn.get(taskRef);
      if (!snap.exists) {
        return false;
      }
      const data = snap.data() || {};
      const agentRun = (data.agentRun as Record<string, unknown>) || {};
      if (agentRun.status !== 'idle') {
        // Status flipped between snapshot and claim — let the new owner have
        // it (or wait for cancel/retry to flip it back to idle).
        return false;
      }
      const leasedBy = agentRun.leasedBy as string | undefined;
      const leasedAt = agentRun.leasedAt as Timestamp | undefined;
      if (
        leasedBy &&
        leasedBy !== this.instanceId &&
        leasedAt &&
        Date.now() - leasedAt.toMillis() < LEASE_TTL_MS
      ) {
        // Held by another live replica.
        return false;
      }
      txn.update(taskRef, {
        'agentRun.leasedBy': this.instanceId,
        'agentRun.leasedAt': FieldValue.serverTimestamp(),
        'agentRun.status': 'running',
        'agentRun.updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    });
  }

  private async runClaimedTask(
    taskId: string,
    agent: AgentDefinition,
    assignee: string
  ): Promise<void> {
    const taskRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${taskId}`
    );
    const taskSnap = await taskRef.get();
    const taskData = taskSnap.data() || {};

    // Load the full comment history so the agent can see prior messages
    // (its own questions, the human's replies, applied/rejected proposals).
    // Without this the agent re-asks the same question every time the human
    // re-assigns the task, since each `generateText` call starts a fresh
    // model context.
    const commentsSnap = await this.cmsClient.db
      .collection(
        `Projects/${this.cmsClient.projectId}/Tasks/${taskId}/Comments`
      )
      .orderBy('createdAt', 'asc')
      .get();
    const comments = commentsSnap.docs.map((d) => d.data());
    const prompt = buildAgentPrompt(taskData, comments);

    const model =
      (agent.model && findModel(this.aiConfig, agent.model)) ||
      findModel(this.aiConfig);
    if (!model) {
      await this.markTaskErrored(
        taskId,
        'no AI model configured to run the agent',
        assignee
      );
      return;
    }

    const ctx: AgentRunContext = {
      agent,
      cmsClient: this.cmsClient,
      db: this.cmsClient.db,
      projectId: this.cmsClient.projectId,
      taskId,
      createdBy: assignee,
      checks: this.checks,
      viteServer: this.viteServer,
    };

    await this.runner({ctx, model, prompt});
  }

  private async markTaskErrored(
    taskId: string,
    error: string,
    createdBy: string
  ): Promise<void> {
    const taskRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${taskId}`
    );
    await taskRef.update({
      'agentRun.status': 'errored',
      'agentRun.lastError': error,
      'agentRun.leasedBy': null,
      'agentRun.leasedAt': null,
      'agentRun.updatedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: createdBy,
    });
  }
}

/**
 * Ensures a single `AgentWorker` is running for the current process. Idempotent:
 * subsequent calls are no-ops once the worker has been started. Called from
 * the CMS plugin's `configureServer` so the listener kicks in on the first
 * authenticated CMS request.
 *
 * If AI is not configured, returns null without throwing — the worker is a
 * silent no-op on projects that haven't enabled AI agents.
 */
let _sharedWorker: AgentWorker | null = null;
export function ensureAgentWorker(
  rootConfig: RootConfig,
  options: {viteServer?: import('vite').ViteDevServer} = {}
): AgentWorker | null {
  if (_sharedWorker) {
    // The first request that woke the worker may not have had a viteServer
    // (it's only attached on dev requests). Refresh on every call so a later
    // dev request can supply one.
    _sharedWorker.setViteServer(options.viteServer);
    return _sharedWorker;
  }
  if (!getAiConfig(rootConfig)) {
    return null;
  }
  _sharedWorker = new AgentWorker(rootConfig, {
    viteServer: options.viteServer,
  });
  _sharedWorker.start();
  return _sharedWorker;
}

/** Test-only hook to reset the shared worker singleton. */
export function _resetSharedAgentWorkerForTests() {
  _sharedWorker?.stop();
  _sharedWorker = null;
}

/**
 * Pulls the registered CMS checks off the root-cms plugin config so the
 * worker can hand them to agent runs. Returns an empty array when the
 * plugin or its `checks` field is absent.
 */
function readChecksFromPlugin(rootConfig: RootConfig): CMSCheck[] {
  try {
    const cmsPlugin = getCmsPlugin(rootConfig);
    const config = cmsPlugin.getConfig() as {checks?: CMSCheck[]};
    return Array.isArray(config.checks) ? config.checks : [];
  } catch {
    return [];
  }
}

/**
 * Builds the agent's user prompt: task title + description plus any prior
 * conversation history (comments authored by the agent and the human).
 *
 * Including history is what stops the loop bug — without it, every fresh
 * `generateText` invocation sees only the task description and re-asks the
 * same question the agent already asked on a previous turn.
 */
export function buildAgentPrompt(
  task: Record<string, unknown>,
  comments: Array<Record<string, unknown>> = []
): string {
  const title = String(task.title || '').trim();
  const description = String(task.description || '').trim();
  const lines: string[] = ['# Task'];
  if (title) {
    lines.push(`**${title}**`);
  }
  if (description) {
    lines.push('', description);
  }
  if (!title && !description) {
    lines.push('Investigate this task and propose next steps.');
  }

  const visible = comments.filter((c) => !c.isDeleted);
  if (visible.length > 0) {
    lines.push('', '# Conversation history');
    lines.push(
      'Previous comments on this task, oldest first. Use this to avoid ' +
        're-asking questions already answered, and to understand how prior ' +
        'proposals were resolved.',
      ''
    );
    for (const comment of visible) {
      lines.push(renderCommentForPrompt(comment));
      lines.push('');
    }
  }

  lines.push(
    '# Your turn',
    'Continue from the latest comment above. If the human just answered ' +
      'a question of yours, act on the answer. If a previous proposal was ' +
      'rejected, do not re-propose the same change. If everything looks ' +
      'resolved, finish without further action.'
  );
  return lines.join('\n');
}

function renderCommentForPrompt(comment: Record<string, unknown>): string {
  const author = formatAuthor(comment.createdBy);
  const proposal = comment.proposal as
    | {
        tool?: string;
        rationale?: string;
        diffSummary?: string;
        status?: string;
      }
    | undefined;
  if (proposal) {
    const status = proposal.status || 'pending';
    const summary = [
      `_${author}_ posted **proposal** \`${proposal.tool}\` — status: **${status}**`,
    ];
    if (proposal.rationale) {
      summary.push(`> ${proposal.rationale}`);
    }
    if (proposal.diffSummary) {
      summary.push('```diff', proposal.diffSummary, '```');
    }
    return summary.join('\n');
  }
  const content = String(comment.content || '').trim();
  return `_${author}_:\n${content || '(empty)'}`;
}

function formatAuthor(value: unknown): string {
  const str = String(value || 'unknown');
  if (str.startsWith('agent:')) {
    return `🤖 ${str.slice('agent:'.length)} (agent)`;
  }
  return str;
}
