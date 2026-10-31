import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {ReferenceFieldEditorModalProps} from './ReferenceFieldEditorModal.js';

export const REFERENCE_FIELD_EDITOR_MODAL_ID = 'ReferenceFieldEditorModal';

/** Hook for opening the reference field editor modal. */
export function useReferenceFieldEditorModal() {
  const modals = useModals();
  return {
    open: (props: ReferenceFieldEditorModalProps) => {
      modals.openContextModal<ReferenceFieldEditorModalProps>(
        REFERENCE_FIELD_EDITOR_MODAL_ID,
        {
          className: 'ReferenceFieldEditorModalWrap',
          innerProps: props,
          title: `Edit ${props.docId}`,
          size: 'xl',
          closeOnClickOutside: false,
          closeOnEscape: false,
        }
      );
    },
  };
}
