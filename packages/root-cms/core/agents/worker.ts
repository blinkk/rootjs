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
import {RootCMSClient} from '../client.js';
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
    const agents = await loadAgents();
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
    const prompt = buildAgentPrompt(taskData);

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
export function ensureAgentWorker(rootConfig: RootConfig): AgentWorker | null {
  if (_sharedWorker) {
    return _sharedWorker;
  }
  if (!getAiConfig(rootConfig)) {
    return null;
  }
  _sharedWorker = new AgentWorker(rootConfig);
  _sharedWorker.start();
  return _sharedWorker;
}

/** Test-only hook to reset the shared worker singleton. */
export function _resetSharedAgentWorkerForTests() {
  _sharedWorker?.stop();
  _sharedWorker = null;
}

/** Builds the agent's first-turn user prompt from the task fields. */
export function buildAgentPrompt(task: Record<string, unknown>): string {
  const title = String(task.title || '').trim();
  const description = String(task.description || '').trim();
  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}`);
  }
  if (description) {
    if (title) {
      lines.push('');
    }
    lines.push(description);
  }
  if (lines.length === 0) {
    lines.push('Investigate this task and propose next steps.');
  }
  return lines.join('\n');
}
