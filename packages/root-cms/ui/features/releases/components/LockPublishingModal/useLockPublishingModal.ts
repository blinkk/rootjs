import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {LockPublishingModalProps} from './LockPublishingModal.js';

export const LOCK_PUBLISHING_MODAL_ID = 'LockPublishingModal';

/** Hook for opening the lock publishing modal. */
export function useLockPublishingModal(props: LockPublishingModalProps) {
  const modals = useModals();
  return {
    open: (options?: Partial<LockPublishingModalProps>) => {
      const modalProps = {...props, ...options};
      let title: string;
      if (modalProps.unlock) {
        title = `Unlock publishing for ${props.docId}`;
      } else if (modalProps.existingLock) {
        title = `Edit publishing lock for ${props.docId}`;
      } else {
        title = `Lock publishing for ${props.docId}`;
      }
      modals.openContextModal(LOCK_PUBLISHING_MODAL_ID, {
        title,
        innerProps: {...props, ...options},
        size: '600px',
      });
    },
  };
}
