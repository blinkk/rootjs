import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {PruneTranslationsModalProps} from './PruneTranslationsModal.js';

export const PRUNE_TRANSLATIONS_MODAL_ID = 'PruneTranslationsModal';

/** Hook that returns an `open()` function for launching the prune modal. */
export function usePruneTranslationsModal() {
  const modals = useModals();
  return {
    open: (innerProps: PruneTranslationsModalProps) => {
      modals.openContextModal(PRUNE_TRANSLATIONS_MODAL_ID, {
        title: `Prune unused strings from ${innerProps.docId}`,
        innerProps,
        size: 600,
      });
    },
  };
}
