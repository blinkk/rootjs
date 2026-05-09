/**
 * The `apply` tool bundle. Grants an agent the ability to execute pending
 * proposals server-side under its own identity — used for autonomous
 * agent-to-agent flows (e.g. project-manager triages → specialist proposes
 * → reviewer-agent applies, no human roundtrip).
 *
 * This bundle is opt-in via `defineAgent({allowedTools: [..., 'apply']})`.
 * Agents without the bundle still need a human to click Apply on the
 * proposal, preserving the default safety stance.
 */

import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {applyProposalAsAgent} from './apply-proposal.js';
import type {AgentRunContext} from './run-context.js';

export function createApplyTool(ctx: AgentRunContext): ToolSet {
  return {
    proposal_apply: tool({
      description:
        'Apply a pending proposal posted on this task by another agent. ' +
        'Executes the underlying mutating tool (e.g. doc_updateField) ' +
        'server-side under your agent identity and marks the proposal as ' +
        "`applied`. Use this when you have reviewed a peer agent's " +
        'proposal and judged it safe to land. Supported tools: doc_set, ' +
        'doc_create, doc_updateField, doc_duplicate. Publish/delete ' +
        'operations remain human-only.',
      inputSchema: z.object({
        commentId: z
          .string()
          .describe(
            'Id of the proposal comment to apply. Find it via the task ' +
              'history or `tasks_list`.'
          ),
      }),
      execute: async ({commentId}) => {
        const result = await applyProposalAsAgent(ctx, commentId);
        return {ok: true, ...result};
      },
    }),
  };
}
