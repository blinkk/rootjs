/**
 * The `proposeChange` tool. Agents emit a structured proposal as a comment
 * on the active task; the proposal carries the mutating tool the agent
 * wants run plus its inputs. The mutation only executes when a human clicks
 * "Apply" in the UI, which routes through the regular browser-side
 * `executeCmsTool` path under the user's Firebase auth.
 *
 * The agent never writes to the CMS directly. This is the only way an
 * agent communicates a mutation intent.
 */

import {tool, ToolSet} from 'ai';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {z} from 'zod';
import type {AgentRunContext} from './run-context.js';

/**
 * Whitelist of mutating tool ids that an agent's `proposeChange` is allowed
 * to target. Mirrors the safety policy in `ai-tools.ts` — publish/delete
 * style operations are deliberately excluded so a hallucinated proposal
 * cannot be applied with a single "Apply" click.
 */
export const PROPOSAL_TARGET_TOOLS = [
  'doc_set',
  'doc_create',
  'doc_updateField',
  'doc_duplicate',
  'doc_translateField',
] as const;
export type ProposalTargetTool = (typeof PROPOSAL_TARGET_TOOLS)[number];

const PROPOSAL_TARGETS_SET: ReadonlySet<string> = new Set(
  PROPOSAL_TARGET_TOOLS
);

/**
 * Builds the `proposeChange` tool. The execute function posts a structured
 * comment to the active task; the human reviewer applies (or rejects) it
 * via the task UI.
 */
export function createProposeTool(ctx: AgentRunContext): ToolSet {
  return {
    proposeChange: tool({
      description:
        'Propose a mutation to a CMS document. The proposal is posted as a ' +
        'comment on the active task; a human reviewer applies it under their ' +
        'own credentials. Use this for any change you want made to the CMS — ' +
        'you do NOT have direct write access. Set `tool` to one of: ' +
        PROPOSAL_TARGET_TOOLS.join(', ') +
        '. Always include a clear `rationale` and a markdown `diffSummary` ' +
        'so the reviewer can understand the change at a glance.',
      inputSchema: z.object({
        tool: z
          .string()
          .describe(
            'The mutating tool to invoke when applied (e.g. "doc_updateField").'
          ),
        input: z
          .record(z.string(), z.any())
          .describe('Input that will be passed to the tool when applied.'),
        rationale: z
          .string()
          .min(1)
          .describe(
            'Short human-readable explanation surfaced on the comment.'
          ),
        diffSummary: z
          .string()
          .optional()
          .describe(
            'Markdown summary of the change shown to the reviewer. ' +
              'Optional but strongly recommended.'
          ),
      }),
      execute: async (input) => {
        if (!PROPOSAL_TARGETS_SET.has(input.tool)) {
          throw new Error(
            `proposeChange: unsupported tool "${input.tool}" ` +
              `(allowed: ${PROPOSAL_TARGET_TOOLS.join(', ')})`
          );
        }
        const commentId = await postProposalComment(ctx, input);
        return {ok: true, commentId};
      },
    }),
  };
}

interface ProposalInput {
  tool: string;
  input: Record<string, unknown>;
  rationale: string;
  diffSummary?: string;
}

async function postProposalComment(
  ctx: AgentRunContext,
  input: ProposalInput
): Promise<string> {
  const commentRef = ctx.db
    .collection(`Projects/${ctx.projectId}/Tasks/${ctx.taskId}/Comments`)
    .doc();
  const content = renderProposalContent(input);
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
    proposal: {
      tool: input.tool,
      input: input.input,
      rationale: input.rationale,
      diffSummary: input.diffSummary || '',
      status: 'pending',
    },
    // Posting a proposal also adds the 💬 reaction so the timeline shows the
    // agent flagged a substantive update.
    reactions: {'💬': [ctx.createdBy]},
  });
  return commentRef.id;
}

function renderProposalContent(input: ProposalInput): string {
  const lines: string[] = [`**Proposal: ${input.tool}**`, '', input.rationale];
  if (input.diffSummary) {
    lines.push('', input.diffSummary);
  }
  return lines.join('\n');
}

// Re-export Timestamp so consumers don't need to import firebase-admin.
export {Timestamp};
