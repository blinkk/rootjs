/**
 * Server-side helpers for posting agent activity to a task. The runner uses
 * these to record reactions, status comments, and lifecycle transitions on
 * the task being worked on.
 */

import {FieldValue} from 'firebase-admin/firestore';
import type {AgentRunContext} from './run-context.js';

/**
 * Posts a plain-text status comment from the agent. Used for the initial
 * "starter" comment and any final status messages. Returns the new comment
 * id so the caller can attach further reactions.
 */
export async function postAgentStatusComment(
  ctx: AgentRunContext,
  content: string,
  initialReaction?: string
): Promise<string> {
  const commentRef = ctx.db
    .collection(`Projects/${ctx.projectId}/Tasks/${ctx.taskId}/Comments`)
    .doc();
  await commentRef.set({
    id: commentRef.id,
    taskId: ctx.taskId,
    parentId: null,
    content,
    body: null,
    mentions: [],
    createdAt: FieldValue.serverTimestamp(),
    createdBy: ctx.createdBy,
    history: [],
    reactions: initialReaction ? {[initialReaction]: [ctx.createdBy]} : {},
  });
  return commentRef.id;
}

/**
 * Adds the agent as a reactor to an existing comment. No-op if the agent is
 * already a reactor under that emoji.
 */
export async function addAgentReaction(
  ctx: AgentRunContext,
  commentId: string,
  emoji: string
): Promise<void> {
  const commentRef = ctx.db.doc(
    `Projects/${ctx.projectId}/Tasks/${ctx.taskId}/Comments/${commentId}`
  );
  await ctx.db.runTransaction(async (txn) => {
    const snap = await txn.get(commentRef);
    if (!snap.exists) {
      return;
    }
    const data = snap.data() || {};
    const reactions = {...((data.reactions as Record<string, string[]>) || {})};
    const reactors = new Set<string>(reactions[emoji] || []);
    if (reactors.has(ctx.createdBy)) {
      return;
    }
    reactors.add(ctx.createdBy);
    reactions[emoji] = Array.from(reactors);
    txn.update(commentRef, {reactions});
  });
}

/**
 * Persists a single step event from an agent run so the UI can stream
 * the agent's progress live. Stored under a `Steps` subcollection on the
 * task; ordered by `createdAt`. The runner calls this from `onStepFinish`
 * after each tool-loop iteration.
 */
export async function recordAgentStep(
  ctx: AgentRunContext,
  step: {
    index: number;
    text?: string;
    toolCalls?: Array<{toolName: string; input?: unknown}>;
    toolResults?: Array<{toolName: string; ok: boolean; error?: string}>;
    tokensUsed?: number;
  }
): Promise<void> {
  const stepsRef = ctx.db.collection(
    `Projects/${ctx.projectId}/Tasks/${ctx.taskId}/AgentSteps`
  );
  await stepsRef.add({
    index: step.index,
    text: truncate(step.text || '', 600) || null,
    toolCalls: (step.toolCalls || []).map((tc) => ({
      toolName: tc.toolName,
      input: summarizeInput(tc.input),
    })),
    toolResults: (step.toolResults || []).map((tr) => ({
      toolName: tr.toolName,
      ok: tr.ok,
      error: tr.error || null,
    })),
    tokensUsed: step.tokensUsed ?? 0,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: ctx.createdBy,
  });
}

/**
 * Clears prior step records on a task. Called by the worker before each
 * run so the UI shows the fresh run rather than an accumulated history.
 */
export async function clearAgentSteps(ctx: AgentRunContext): Promise<void> {
  const stepsRef = ctx.db.collection(
    `Projects/${ctx.projectId}/Tasks/${ctx.taskId}/AgentSteps`
  );
  const snap = await stepsRef.get();
  if (snap.empty) {
    return;
  }
  const batch = ctx.db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

/**
 * Reduces a tool input to a small display-only summary so the live activity
 * feed stays compact. Whole arbitrary objects can blow up Firestore doc
 * size; we keep just the keys + short stringified values.
 */
function summarizeInput(input: unknown): Record<string, string> | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input !== 'object') {
    return {value: String(input).slice(0, 200)};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    let str: string;
    if (typeof value === 'string') {
      str = value;
    } else {
      try {
        str = JSON.stringify(value);
      } catch {
        str = String(value);
      }
    }
    out[key] = str.slice(0, 200);
  }
  return out;
}

/**
 * Updates the agentRun lifecycle metadata on a task. Used to mark the
 * task running, errored, cancelled, or idle (run complete).
 */
export async function updateAgentRunStatus(
  ctx: AgentRunContext,
  patch: {
    status: 'running' | 'completed' | 'errored' | 'cancelled' | 'idle';
    leasedBy?: string | null;
    leasedAt?: FirebaseFirestore.Timestamp | null;
    tokensUsed?: number;
    tokensCap?: number | null;
    lastError?: string | null;
  }
): Promise<void> {
  const taskRef = ctx.db.doc(`Projects/${ctx.projectId}/Tasks/${ctx.taskId}`);
  const update: Record<string, unknown> = {
    'agentRun.status': patch.status,
    'agentRun.updatedAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.createdBy,
  };
  if (patch.leasedBy !== undefined) {
    update['agentRun.leasedBy'] = patch.leasedBy;
  }
  if (patch.leasedAt !== undefined) {
    update['agentRun.leasedAt'] = patch.leasedAt;
  }
  if (patch.tokensUsed !== undefined) {
    update['agentRun.tokensUsed'] = patch.tokensUsed;
  }
  if (patch.tokensCap !== undefined) {
    update['agentRun.tokensCap'] = patch.tokensCap;
  }
  if (patch.lastError !== undefined) {
    update['agentRun.lastError'] = patch.lastError;
  }
  await taskRef.update(update);
}
