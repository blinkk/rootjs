import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {PortTranslationsModalProps} from './PortTranslationsModal.js';

export const PORT_TRANSLATIONS_MODAL_ID = 'PortTranslationsModal';

/** Hook that returns an `open()` function for launching the port modal. */
export function usePortTranslationsModal() {
  const modals = useModals();
  return {
    open: (innerProps: PortTranslationsModalProps) => {
      modals.openContextModal(PORT_TRANSLATIONS_MODAL_ID, {
        title: 'Port translations',
        innerProps,
        size: 'clamp(70%, 880px, 1040px)',
      });
    },
  };
}
