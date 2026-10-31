import './PublishChecksModal.css';

import {IconAlertTriangle, IconCircleX} from '@tabler/icons-preact';
import {
  summarizePublishChecks,
  type PublishCheckResult,
} from '../../../../../shared/publish-checks.js';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {type ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {PUBLISH_CHECKS_MODAL_ID} from '../../usePublishChecks.js';
import {PublishChecksResults} from '../PublishChecksResults/PublishChecksResults.js';

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
    <div className="PublishChecksModal flex flex-col gap-4">
      <div className="PublishChecksModal__intro flex items-start gap-2">
        <div className="PublishChecksModal__icon flex shrink-0 leading-none">
          {blocked ? (
            <IconCircleX
              className="text-danger"
              size={20}
              stroke={1.5}
              aria-hidden="true"
            />
          ) : (
            <IconAlertTriangle
              className="text-warning"
              size={20}
              stroke={1.5}
              aria-hidden="true"
            />
          )}
        </div>
        <Text size="body-sm">
          {blocked
            ? `${summary.blocking.length} required check(s) failed, so nothing was published. Resolve the issues below and try again.`
            : `The content went live, but ${summary.warnings.length} check(s) reported warnings.`}
        </Text>
      </div>

      <div className="PublishChecksModal__results overflow-y-auto">
        <PublishChecksResults results={shown} />
      </div>

      <div className="PublishChecksModal__buttons flex flex-wrap items-center justify-end gap-2">
        {blocked && props.canBypass && (
          <Button
            variant="danger-outline"
            className="PublishChecksModal__bypass mr-auto"
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
        <Button variant="primary" onClick={() => context.closeModal(id)}>
          {blocked ? 'Cancel' : 'Got it'}
        </Button>
      </div>
    </div>
  );
}

PublishChecksModal.id = PUBLISH_CHECKS_MODAL_ID;
