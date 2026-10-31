import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {EditTranslationsModalProps} from './EditTranslationsModal.js';

export const EDIT_TRANSLATIONS_MODAL_ID = 'EditTranslationsModal';

/** Hook for opening the edit translations modal. */
export function useEditTranslationsModal() {
  const modals = useModals();
  return {
    open: (props: EditTranslationsModalProps) => {
      modals.openContextModal(EDIT_TRANSLATIONS_MODAL_ID, {
        innerProps: props,
        size: '900px',
        title: 'Edit translations',
        overflow: 'inside',
        className: 'EditTranslationsModalWrap',
      });
    },
    close: () => {
      modals.closeModal(EDIT_TRANSLATIONS_MODAL_ID);
    },
  };
}
