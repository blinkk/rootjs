import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {ComponentPickerModalProps} from './ComponentPickerModal.js';

export const COMPONENT_PICKER_MODAL_ID = 'ComponentPickerModal';

/** Hook for opening the component picker modal. */
export function useComponentPickerModal() {
  const modals = useModals();
  return {
    open: (props: ComponentPickerModalProps) => {
      modals.openContextModal(COMPONENT_PICKER_MODAL_ID, {
        innerProps: props,
        size: '720px',
        title: 'Select a component',
      });
    },
    close: () => {
      modals.closeModal(COMPONENT_PICKER_MODAL_ID);
    },
  };
}
