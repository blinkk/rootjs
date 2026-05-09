/**
 * Server-side execution of proposal payloads — used when an agent applies
 * another agent's proposal autonomously (via the `proposal_apply` tool).
 *
 * Mirrors the safety policy in `tools-propose.ts`: only the explicitly
 * whitelisted mutating tools (`doc_set`, `doc_create`, `doc_updateField`,
 * `doc_duplicate`) execute here. Publish/delete and other irreversible
 * operations remain human-only.
 *
 * The CMS audit trail records `appliedBy: agent:<name>` so the chain of
 * agent-to-agent mutations is traceable.
 */

import {FieldValue} from 'firebase-admin/firestore';
import type {AgentRunContext} from './run-context.js';

export type AutoApplyableTool =
  | 'doc_set'
  | 'doc_create'
  | 'doc_updateField'
  | 'doc_duplicate';

const SUPPORTED_TOOLS: ReadonlySet<AutoApplyableTool> = new Set([
  'doc_set',
  'doc_create',
  'doc_updateField',
  'doc_duplicate',
]);

/**
 * Executes a proposal payload server-side and marks the proposal applied.
 * Returns the mutated doc id on success.
 *
 * Throws if the proposal is not in `pending` state, the tool is outside the
 * supported set, or the underlying CMS write fails.
 */
export async function applyProposalAsAgent(
  ctx: AgentRunContext,
  commentId: string
): Promise<{docId: string; tool: string}> {
  const commentRef = ctx.db.doc(
    `Projects/${ctx.projectId}/Tasks/${ctx.taskId}/Comments/${commentId}`
  );
  const snap = await commentRef.get();
  if (!snap.exists) {
    throw new Error(`proposal_apply: comment ${commentId} not found`);
  }
  const data = snap.data() as Record<string, unknown>;
  const proposal = data.proposal as
    | {tool?: string; input?: Record<string, unknown>; status?: string}
    | undefined;
  if (!proposal) {
    throw new Error(`proposal_apply: comment ${commentId} is not a proposal`);
  }
  if (proposal.status !== 'pending') {
    throw new Error(
      `proposal_apply: proposal ${commentId} is already ${proposal.status}`
    );
  }
  const tool = proposal.tool as AutoApplyableTool | undefined;
  if (!tool || !SUPPORTED_TOOLS.has(tool)) {
    throw new Error(
      `proposal_apply: tool "${tool}" is not auto-applyable (allowed: ` +
        `${Array.from(SUPPORTED_TOOLS).join(', ')})`
    );
  }

  const input = (proposal.input || {}) as Record<string, unknown>;
  const docId = await dispatchTool(ctx, tool, input);

  await commentRef.update({
    'proposal.status': 'applied',
    'proposal.appliedBy': ctx.createdBy,
    'proposal.appliedAt': FieldValue.serverTimestamp(),
    'proposal.applyError': null,
  });

  return {docId, tool};
}

async function dispatchTool(
  ctx: AgentRunContext,
  tool: AutoApplyableTool,
  input: Record<string, unknown>
): Promise<string> {
  switch (tool) {
    case 'doc_set': {
      const docId = requireString(input, 'docId');
      const fields = requireObject(input, 'fields');
      await ctx.cmsClient.saveDraftData(docId, fields, {
        modifiedBy: ctx.createdBy,
      });
      return docId;
    }
    case 'doc_create': {
      const docId = requireString(input, 'docId');
      // saveDraftData also handles initial creation when the draft doesn't
      // exist; reject if the doc is already there to match the
      // doc_create contract from `ai-tools.ts`.
      const {collection, slug} = parseDocId(docId);
      const existing = await ctx.cmsClient.getRawDoc(collection, slug, {
        mode: 'draft',
      });
      if (existing) {
        throw new Error(`proposal_apply: ${docId} already exists`);
      }
      const fields = (input.fields as Record<string, unknown>) || {};
      await ctx.cmsClient.saveDraftData(docId, fields, {
        modifiedBy: ctx.createdBy,
      });
      return docId;
    }
    case 'doc_updateField': {
      const docId = requireString(input, 'docId');
      const path = requireString(input, 'path');
      const value = input.value;
      await ctx.cmsClient.updateDraftData(docId, path, value, {
        modifiedBy: ctx.createdBy,
      });
      return docId;
    }
    case 'doc_duplicate': {
      const fromDocId = requireString(input, 'fromDocId');
      const toDocId = requireString(input, 'toDocId');
      const {collection: fromCollection, slug: fromSlug} =
        parseDocId(fromDocId);
      const source = await ctx.cmsClient.getRawDoc(fromCollection, fromSlug, {
        mode: 'draft',
      });
      if (!source) {
        throw new Error(`proposal_apply: source ${fromDocId} not found`);
      }
      const {collection: toCollection, slug: toSlug} = parseDocId(toDocId);
      const existing = await ctx.cmsClient.getRawDoc(toCollection, toSlug, {
        mode: 'draft',
      });
      if (existing) {
        throw new Error(`proposal_apply: target ${toDocId} already exists`);
      }
      await ctx.cmsClient.saveDraftData(toDocId, source.fields || {}, {
        modifiedBy: ctx.createdBy,
      });
      return toDocId;
    }
    default: {
      // Exhaustiveness check.
      const _never: never = tool;
      throw new Error(`unsupported tool: ${_never}`);
    }
  }
}

function parseDocId(docId: string): {collection: string; slug: string} {
  const idx = docId.indexOf('/');
  if (idx === -1) {
    throw new Error(`invalid docId "${docId}" (expected "Collection/slug")`);
  }
  return {collection: docId.slice(0, idx), slug: docId.slice(idx + 1)};
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`proposal_apply: missing or invalid "${key}"`);
  }
  return value;
}

function requireObject(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = obj[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`proposal_apply: missing or invalid "${key}"`);
  }
  return value as Record<string, unknown>;
}
