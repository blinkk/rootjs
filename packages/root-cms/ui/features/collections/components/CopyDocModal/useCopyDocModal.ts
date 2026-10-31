import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {CopyDocModalProps} from './CopyDocModal.js';

export const COPY_DOC_MODAL_ID = 'CopyDocModal';

/** Hook for opening the copy doc modal. */
export function useCopyDocModal(props: CopyDocModalProps) {
  const modals = useModals();
  return {
    open: (overrideProps?: Partial<CopyDocModalProps>) => {
      modals.openContextModal(COPY_DOC_MODAL_ID, {
        innerProps: {...props, ...overrideProps},
      });
    },
  };
}
