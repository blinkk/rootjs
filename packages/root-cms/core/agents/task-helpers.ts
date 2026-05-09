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
 * Updates the agentRun lifecycle metadata on a task. Used to mark the
 * task running, errored, cancelled, or idle (run complete).
 */
export async function updateAgentRunStatus(
  ctx: AgentRunContext,
  patch: {
    status: 'running' | 'errored' | 'cancelled' | 'idle';
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
