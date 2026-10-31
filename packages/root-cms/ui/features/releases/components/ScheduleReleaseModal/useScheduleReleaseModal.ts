import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {ScheduleReleaseModalProps} from './ScheduleReleaseModal.js';

export const SCHEDULE_RELEASE_MODAL_ID = 'ScheduleReleaseModal';

/** Hook for opening the schedule release modal. */
export function useScheduleReleaseModal(props: ScheduleReleaseModalProps) {
  const modals = useModals();
  return {
    open: () => {
      modals.openContextModal(SCHEDULE_RELEASE_MODAL_ID, {
        title: `Schedule release: ${props.releaseId}`,
        innerProps: props,
      });
    },
  };
}
