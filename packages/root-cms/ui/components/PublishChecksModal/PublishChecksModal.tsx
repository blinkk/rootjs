import './PublishChecksModal.css';

import {Button} from '@mantine/core';
import {ContextModalProps} from '@mantine/modals';
import {IconAlertTriangle, IconCircleX} from '@tabler/icons-preact';
import {
  summarizePublishChecks,
  type PublishCheckResult,
} from '../../../shared/publish-checks.js';
import {PublishChecksResults} from '../PublishChecksResults/PublishChecksResults.js';
import {Text} from '../Text/Text.js';

const MODAL_ID = 'PublishChecksModal';

/**
 * Which outcome the modal is reporting.
 *
 * - `blocked`: required checks failed, so publishing was halted.
 * - `warnings`: the content went live, and these warnings need attention.
 */
export type PublishChecksModalMode = 'blocked' | 'warnings';

export interface PublishChecksModalProps {
  [key: string]: unknown;
  /** The results to display. */
  results: PublishCheckResult[];
  /** Which outcome the modal is reporting. */
  mode: PublishChecksModalMode;
  /** Verb for the halted action, e.g. "Publish" or "Schedule". */
  actionLabel: string;
  /**
   * Whether the current user may proceed despite the failed checks. Only
   * admins can bypass failed required checks.
   */
  canBypass?: boolean;
  /**
   * Called when the user chooses to proceed despite the failed checks. The
   * modal closes itself afterwards, so this only needs to record the choice.
   */
  onBypass?: () => void;
}

export function PublishChecksModal(
  modalProps: ContextModalProps<PublishChecksModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const summary = summarizePublishChecks(props.results);
  const blocked = props.mode === 'blocked';
  const shown = blocked
    ? [...summary.blocking, ...summary.warnings]
    : summary.warnings;

  return (
    <div className="PublishChecksModal">
      <div className="PublishChecksModal__intro">
        <div className="PublishChecksModal__intro__icon">
          {blocked ? (
            <IconCircleX size={20} stroke={1.5} color="#c92a2a" />
          ) : (
            <IconAlertTriangle size={20} stroke={1.5} color="#e67700" />
          )}
        </div>
        <Text size="body-sm">
          {blocked
            ? `${summary.blocking.length} required check(s) failed, so nothing was published. Resolve the issues below and try again.`
            : `The content went live, but ${summary.warnings.length} check(s) reported warnings.`}
        </Text>
      </div>

      <div className="PublishChecksModal__results">
        <PublishChecksResults results={shown} />
      </div>

      <div className="PublishChecksModal__buttons">
        {blocked && props.canBypass && (
          <Button
            className="PublishChecksModal__buttons__bypass"
            variant="outline"
            size="xs"
            color="red"
            type="button"
            onClick={() => {
              // Record the choice before closing: the close fires the modal's
              // `onClose`, which is what settles the caller's decision.
              props.onBypass?.();
              context.closeModal(id);
            }}
          >
            {props.actionLabel} anyway
          </Button>
        )}
        <Button
          variant="filled"
          onClick={() => context.closeModal(id)}
          type="button"
          size="xs"
          color="dark"
        >
          {blocked ? 'Cancel' : 'Got it'}
        </Button>
      </div>
    </div>
  );
}

PublishChecksModal.id = MODAL_ID;
