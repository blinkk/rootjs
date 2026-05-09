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
import {generateText} from 'ai';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {
  findModel,
  getAiConfig,
  resolveLanguageModel,
  type AiConfig,
} from '../ai-chat.js';
import type {CMSCheck} from '../checks.js';
import {RootCMSClient, getCmsPlugin} from '../client.js';
import {getLinkingConventions} from './conventions.js';
import {loadAgents} from './registry.js';
import {AGENT_ASSIGNEE_PREFIX, type AgentRunContext} from './run-context.js';
import {buildAgentToolset, DEFAULT_MAX_STEPS, runAgent} from './runner.js';
import {addAgentReaction} from './task-helpers.js';
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
  private unsubscribeComments: (() => void) | null = null;
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly commentSeen = new Set<string>();
  private readonly mentionsInflight = new Set<string>();

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

    // Second listener: react to new task comments. When a comment mentions
    // an agent, the worker either reassigns (mention is first token of the
    // comment) or runs the agent ephemerally on the task.
    //
    // We skip the *first* snapshot batch entirely — Firestore delivers
    // every existing matching doc as `added` on initial attach, which we
    // don't want to re-process. Subsequent snapshots are real diffs.
    // (Earlier we filtered with `where('createdAt', '>=', startedAt)` but
    // that's unreliable across client/server clock skew.)
    let commentsListenerPrimed = false;
    const commentsQuery = this.cmsClient.db.collectionGroup('Comments');
    this.unsubscribeComments = commentsQuery.onSnapshot(
      (snapshot) => {
        if (!commentsListenerPrimed) {
          commentsListenerPrimed = true;
          // Mark every doc in the initial state as seen so we don't
          // re-process them if the listener flutters.
          snapshot.docs.forEach((doc) => {
            this.commentSeen.add(doc.ref.path);
          });
          return;
        }
        for (const change of snapshot.docChanges()) {
          if (change.type !== 'added') {
            continue;
          }
          const id = change.doc.ref.path;
          if (this.commentSeen.has(id)) {
            continue;
          }
          this.commentSeen.add(id);
          this.maybeProcessComment(change.doc).catch((err) => {
            console.error(
              `[AgentWorker:${this.instanceId}] comment dispatch failed:`,
              err
            );
          });
        }
      },
      (err) => {
        console.error(
          `[AgentWorker:${this.instanceId}] comments listener error:`,
          err
        );
      }
    );
  }

  /** Tears down the listener. In-flight runs continue to completion. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.unsubscribeComments) {
      this.unsubscribeComments();
      this.unsubscribeComments = null;
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

    // Autonomous chaining: if this task was a subtask, see if its parent is
    // ready to resume (all siblings terminal). The runner already wrote a
    // terminal status for this task; we read fresh data so we don't miss
    // sibling completions that landed mid-run.
    const parentId = (taskData.parentTaskId as string | undefined) || null;
    if (parentId) {
      await this.maybeWakeParentTask(parentId, assignee).catch((err) => {
        console.error(
          `[AgentWorker:${this.instanceId}] wake-parent on ${parentId} failed:`,
          err
        );
      });
    }
  }

  /**
   * Re-arms a parent task's `agentRun` so its agent resumes once every
   * subtask under it is terminal. Posts a summary comment so the parent
   * agent's next run sees the wake reason in conversation history.
   */
  private async maybeWakeParentTask(
    parentId: string,
    completedBy: string
  ): Promise<void> {
    const parentRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${parentId}`
    );
    const parentSnap = await parentRef.get();
    if (!parentSnap.exists) {
      return;
    }
    const parentData = parentSnap.data() || {};
    const parentAssignee = String(parentData.assignee || '');
    if (!parentAssignee.startsWith(AGENT_ASSIGNEE_PREFIX)) {
      // Parent is human-owned (or unassigned) — no agent to wake.
      return;
    }
    const parentRun = (parentData.agentRun as Record<string, unknown>) || {};
    const parentStatus = parentRun.status as string | undefined;
    // Don't disturb a run that's currently in flight or queued; we only
    // wake parents that already wrapped up so they pick up the loose ends.
    const TERMINAL = new Set(['completed', 'errored', 'cancelled']);
    if (!parentStatus || !TERMINAL.has(parentStatus)) {
      return;
    }

    const siblingsSnap = await this.cmsClient.db
      .collection(`Projects/${this.cmsClient.projectId}/Tasks`)
      .where('parentTaskId', '==', parentId)
      .get();
    const stillRunning = siblingsSnap.docs.some((d) => {
      const data = d.data();
      const status = (data.agentRun as {status?: string} | undefined)?.status;
      // Tasks without agentRun are human-owned and effectively pending.
      if (!status) return true;
      return !TERMINAL.has(status);
    });
    if (stillRunning) {
      return;
    }

    await parentRef.update({
      'agentRun.status': 'idle',
      'agentRun.leasedBy': null,
      'agentRun.leasedAt': null,
      'agentRun.lastError': null,
      'agentRun.updatedAt': FieldValue.serverTimestamp(),
    });

    const commentRef = parentRef.collection('Comments').doc();
    await commentRef.set({
      id: commentRef.id,
      taskId: parentId,
      parentId: null,
      content: 'All subtasks completed — parent agent woken to gather results.',
      body: null,
      mentions: [],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: completedBy,
      history: [],
      reactions: {},
    });
  }

  /**
   * Dispatcher invoked for every new task comment. Parses `@<agent-slug>`
   * mentions and either reassigns the task (first-token mention) or fires
   * an ephemeral agent run that doesn't change the assignee.
   *
   * Self-mentions (an agent referencing itself) are ignored, and we do not
   * recurse on comments authored by the same agent we'd dispatch to.
   */
  private async maybeProcessComment(
    doc: FirebaseFirestore.QueryDocumentSnapshot
  ): Promise<void> {
    const data = doc.data();
    const path = doc.ref.path;
    // Comments live at Projects/<p>/Tasks/<id>/Comments/<id>. Ignore comments
    // from other projects (the collectionGroup query doesn't scope by project).
    const parts = path.split('/');
    if (
      parts[0] !== 'Projects' ||
      parts[1] !== this.cmsClient.projectId ||
      parts[2] !== 'Tasks' ||
      parts[4] !== 'Comments'
    ) {
      return;
    }
    const taskId = parts[3];
    const commentId = parts[5];
    const content = String(data.content || '');
    if (!content) {
      return;
    }

    const mentions = extractAgentMentions(content);
    if (mentions.length === 0) {
      return;
    }
    const author = String(data.createdBy || '');

    // If the comment STARTS with `@<agent>`, treat that as a reassign signal.
    // The remaining mentions (if any) become ephemeral runs.
    const leading = content.trim().match(/^@([a-z0-9][a-z0-9-]*)\b/);
    const reassignTarget = leading?.[1] || null;

    const agents = await loadAgents({viteServer: this.viteServer});

    if (reassignTarget && agents.has(reassignTarget)) {
      const target = `${AGENT_ASSIGNEE_PREFIX}${reassignTarget}`;
      if (target !== author) {
        await this.reassignTaskFromMention(taskId, reassignTarget, author);
      }
    }

    for (const name of mentions) {
      if (name === reassignTarget) {
        // Already handled by the reassignment path above.
        continue;
      }
      const agent = agents.get(name);
      if (!agent) {
        continue;
      }
      const targetIdentity = `${AGENT_ASSIGNEE_PREFIX}${name}`;
      if (targetIdentity === author) {
        continue;
      }
      const dedupeKey = `${taskId}:${name}:${commentId}`;
      if (this.mentionsInflight.has(dedupeKey)) {
        continue;
      }
      this.mentionsInflight.add(dedupeKey);
      this.runAgentMention(taskId, agent, commentId).finally(() => {
        this.mentionsInflight.delete(dedupeKey);
      });
    }
  }

  /**
   * Reassigns the task to `agentName` and seeds `agentRun.idle` so the
   * primary task listener picks it up. The triggering author becomes the
   * `requestedBy` so `task_reply` knows where to hand back.
   */
  private async reassignTaskFromMention(
    taskId: string,
    agentName: string,
    requestedBy: string
  ): Promise<void> {
    const taskRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${taskId}`
    );
    await taskRef.update({
      assignee: `${AGENT_ASSIGNEE_PREFIX}${agentName}`,
      'agentRun.status': 'idle',
      'agentRun.tokensUsed': 0,
      'agentRun.lastError': null,
      'agentRun.leasedBy': null,
      'agentRun.leasedAt': null,
      'agentRun.requestedBy': requestedBy || null,
      'agentRun.updatedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: requestedBy || `${AGENT_ASSIGNEE_PREFIX}${agentName}`,
    });
  }

  /**
   * Runs the agent ephemerally on the task: reads context, lets the agent
   * act through its tools, and posts a 👀 → ✅/❌ reaction on the
   * triggering comment. Crucially, this does NOT touch the task's
   * `agentRun` field — the task's primary assignee is unaffected.
   */
  private async runAgentMention(
    taskId: string,
    agent: AgentDefinition,
    triggerCommentId: string
  ): Promise<void> {
    const model =
      (agent.model && findModel(this.aiConfig, agent.model)) ||
      findModel(this.aiConfig);
    if (!model) {
      return;
    }
    const taskRef = this.cmsClient.db.doc(
      `Projects/${this.cmsClient.projectId}/Tasks/${taskId}`
    );
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      return;
    }
    const taskData = taskSnap.data() || {};
    const commentsSnap = await taskRef
      .collection('Comments')
      .orderBy('createdAt', 'asc')
      .get();
    const comments = commentsSnap.docs.map((d) => ({
      ...d.data(),
      id: d.id,
    }));
    // Find the trigger comment so we can quote it back to the agent and
    // demand a reply.
    const triggerComment = comments.find(
      (c) => (c as {id?: string}).id === triggerCommentId
    );
    const triggerContent = String(
      (triggerComment as {content?: string} | undefined)?.content || ''
    );
    const triggerAuthor = String(
      (triggerComment as {createdBy?: string} | undefined)?.createdBy || ''
    );
    const basePrompt = buildAgentPrompt(taskData, comments);
    const prompt =
      `${basePrompt}\n\n# You were @-mentioned\n\n` +
      `**${triggerAuthor || 'Someone'}** just @-mentioned you in a ` +
      `comment on this task:\n\n` +
      `> ${triggerContent.replace(/\n/g, '\n> ') || '(empty comment)'}\n\n` +
      `**Reply directly with \`task_reply\`** as your final action — ` +
      `the human is expecting you to respond to this specific comment. ` +
      `If the mention asks you to do work, do it first (read, propose, ` +
      `subtask) and then summarize what you did in the reply.`;

    const ctx: AgentRunContext = {
      agent,
      cmsClient: this.cmsClient,
      db: this.cmsClient.db,
      projectId: this.cmsClient.projectId,
      taskId,
      createdBy: `${AGENT_ASSIGNEE_PREFIX}${agent.name}`,
      checks: this.checks,
      viteServer: this.viteServer,
    };

    await addAgentReaction(ctx, triggerCommentId, '👀').catch(() => undefined);

    try {
      await generateText({
        model: resolveLanguageModel(model),
        system: `${agent.systemPrompt}\n\n${getLinkingConventions()}`,
        prompt,
        tools: buildAgentToolset(ctx, agent.allowedTools),
        stopWhen: ({steps}: {steps: Array<Record<string, unknown>>}) => {
          if (steps.length >= DEFAULT_MAX_STEPS) {
            return true;
          }
          const last = steps[steps.length - 1] as
            | {toolCalls?: Array<{toolName: string}>}
            | undefined;
          // Mention runs end after task_reply, same as primary runs.
          return Boolean(
            last?.toolCalls?.some((tc) => tc.toolName === 'task_reply')
          );
        },
      });
      await addAgentReaction(ctx, triggerCommentId, '✅').catch(
        () => undefined
      );
    } catch (err) {
      console.error(
        `[AgentWorker:${this.instanceId}] mention run failed for ` +
          `${agent.name} on task ${taskId}:`,
        err
      );
      await addAgentReaction(ctx, triggerCommentId, '❌').catch(
        () => undefined
      );
    }
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
/**
 * Extracts `@<agent-slug>` mentions from comment text. Mirrors the
 * client-side `extractAgentMentions` in `ui/components/TaskCommentInput`
 * so the worker can dispatch on the same patterns the UI surfaces.
 */
function extractAgentMentions(content: string): string[] {
  const result = new Set<string>();
  // Slug-shaped token preceded by start-of-string or whitespace and NOT
  // followed by `@` (which would be an email mention).
  const re = /(^|\s)@([a-z0-9][a-z0-9-]*)(?![A-Za-z0-9._%+-]*@)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    result.add(match[2]);
  }
  return Array.from(result);
}

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
