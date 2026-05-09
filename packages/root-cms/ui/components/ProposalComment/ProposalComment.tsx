import './ProposalComment.css';

import {Button, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconCheck, IconX} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {executeCmsTool} from '../../pages/AIPage/cmsToolHandlers.js';
import {joinClassNames} from '../../utils/classes.js';
import type {TaskComment, TaskProposal} from '../../utils/tasks.js';
import {Markdown} from '../Markdown/Markdown.js';

export interface ProposalCommentProps {
  comment: TaskComment;
  className?: string;
}

/**
 * Renders a proposal comment posted by an agent. Includes Apply/Reject
 * buttons when the proposal is still pending.
 *
 * Apply flow:
 *   1. Hit `/cms/api/agents.proposalApply` to validate and fetch the payload.
 *   2. Run the mutating tool client-side via `executeCmsTool` under the
 *      user's Firebase auth.
 *   3. POST the outcome back to the same endpoint so the proposal status is
 *      finalized server-side.
 */
export function ProposalComment(props: ProposalCommentProps) {
  const {comment, className} = props;
  const proposal = comment.proposal;
  const [busy, setBusy] = useState(false);
  if (!proposal) {
    return null;
  }
  const isPending = proposal.status === 'pending';

  async function applyProposal() {
    setBusy(true);
    try {
      const validated = await callProposalEndpoint('apply', {
        taskId: comment.taskId,
        commentId: comment.id,
      });
      if (!validated.success) {
        throw new Error(validated.error || 'apply failed to validate');
      }
      let outcomeError: string | null = null;
      try {
        await executeCmsTool(validated.toolName!, validated.input || {});
      } catch (err) {
        outcomeError = err instanceof Error ? err.message : String(err);
      }
      const finalize = await callProposalEndpoint('apply', {
        taskId: comment.taskId,
        commentId: comment.id,
        outcome: outcomeError ? 'error' : 'success',
        error: outcomeError,
      });
      if (!finalize.success) {
        throw new Error(finalize.error || 'failed to finalize apply');
      }
      if (outcomeError) {
        throw new Error(outcomeError);
      }
      showNotification({
        title: 'Proposal applied',
        message: `Applied ${proposal.tool}.`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (err) {
      showNotification({
        title: 'Could not apply proposal',
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal() {
    setBusy(true);
    try {
      const result = await callProposalEndpoint('reject', {
        taskId: comment.taskId,
        commentId: comment.id,
      });
      if (!result.success) {
        throw new Error(result.error || 'reject failed');
      }
    } catch (err) {
      showNotification({
        title: 'Could not reject proposal',
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={joinClassNames('ProposalComment', className)}>
      <div className="ProposalComment__header">
        <div className="ProposalComment__title">
          <span className="ProposalComment__icon">📋</span>
          <span>
            Proposal: <code>{proposal.tool}</code>
          </span>
        </div>
        <ProposalStatusBadge status={proposal.status} />
      </div>
      {proposal.rationale && (
        <div className="ProposalComment__rationale">{proposal.rationale}</div>
      )}
      {proposal.diffSummary && (
        <div className="ProposalComment__diff">
          <Markdown
            className="ProposalComment__diffMarkdown"
            code={proposal.diffSummary}
          />
        </div>
      )}
      {proposal.applyError && (
        <div className="ProposalComment__error">
          <strong>Apply error:</strong> {proposal.applyError}
        </div>
      )}
      {isPending ? (
        <div className="ProposalComment__actions">
          <Tooltip
            label="Run this change as the current user"
            withinPortal
            position="top"
          >
            <Button
              size="xs"
              color="dark"
              loading={busy}
              leftIcon={<IconCheck size={14} strokeWidth="1.8" />}
              onClick={applyProposal}
            >
              Apply
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="default"
            disabled={busy}
            leftIcon={<IconX size={14} strokeWidth="1.8" />}
            onClick={rejectProposal}
          >
            Reject
          </Button>
        </div>
      ) : (
        <div className="ProposalComment__resolved">
          {proposal.appliedBy && (
            <span>
              {proposal.status === 'applied' ? 'Applied' : 'Rejected'} by{' '}
              <b>{proposal.appliedBy}</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalStatusBadge(props: {status: TaskProposal['status']}) {
  const {status} = props;
  return (
    <span
      className={joinClassNames(
        'ProposalComment__badge',
        `ProposalComment__badge--${status}`
      )}
    >
      {status}
    </span>
  );
}

interface ProposalApplyResponse {
  success: boolean;
  error?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  applied?: boolean;
  recorded?: boolean;
}

async function callProposalEndpoint(
  action: 'apply' | 'reject',
  body: Record<string, unknown>
): Promise<ProposalApplyResponse> {
  const path =
    action === 'apply'
      ? '/cms/api/agents.proposalApply'
      : '/cms/api/agents.proposalReject';
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ProposalApplyResponse;
}
