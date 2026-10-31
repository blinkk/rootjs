import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {AiEditModalProps} from './AiEditModal.js';

export const AI_EDIT_MODAL_ID = 'AiEditModal';

/** Hook for opening the ai edit modal. */
export function useAiEditModal() {
  const modals = useModals();
  return {
    open: (props: AiEditModalProps) => {
      modals.openContextModal(AI_EDIT_MODAL_ID, {
        title: props.title || 'Edit with AI (Experimental)',
        innerProps: props,
        size: 'calc(min(1920px, calc(100% - 96px)))',
        centered: true,
      });
    },
    close: () => {
      modals.closeModal(AI_EDIT_MODAL_ID);
    },
  };
}
