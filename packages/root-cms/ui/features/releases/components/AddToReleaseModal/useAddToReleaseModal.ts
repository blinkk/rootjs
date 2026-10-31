import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {AddToReleaseModalProps} from './AddToReleaseModal.js';

export const ADD_TO_RELEASE_MODAL_ID = 'AddToReleaseModal';

/** Hook for opening the add to release modal. */
export function useAddToReleaseModal(props: AddToReleaseModalProps) {
  const modals = useModals();
  return {
    open: () => {
      modals.openContextModal(ADD_TO_RELEASE_MODAL_ID, {
        title: 'Add docs to a release',
        innerProps: props,
        size: '600px',
      });
    },
  };
}
