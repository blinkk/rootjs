import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {DocPickerModalProps} from './DocPickerModal.js';

export const DOC_PICKER_MODAL_ID = 'DocPickerModal';

/** Hook for opening the doc picker modal. */
export function useDocPickerModal() {
  const modals = useModals();
  return {
    open: (props: DocPickerModalProps) => {
      modals.openContextModal(DOC_PICKER_MODAL_ID, {
        innerProps: props,
        size: '700px',
        overflow: 'inside',
      });
    },
    close: () => {
      modals.closeModal(DOC_PICKER_MODAL_ID);
    },
  };
}
