import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {EditJsonModalProps} from './EditJsonModal.js';

export const EDIT_JSON_MODAL_ID = 'EditJsonModal';

/** Hook for opening the edit json modal. */
export function useEditJsonModal() {
  const modals = useModals();
  return {
    open: (props: EditJsonModalProps) => {
      modals.openContextModal(EDIT_JSON_MODAL_ID, {
        title: props.title || 'Edit JSON',
        innerProps: props,
        size: '680px',
        centered: true,
      });
    },
    close: () => {
      modals.closeModal(EDIT_JSON_MODAL_ID);
    },
  };
}
