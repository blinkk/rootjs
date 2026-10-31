import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {CompareDraftModalProps} from './CompareDraftModal.js';

export const COMPARE_DRAFT_MODAL_ID = 'CompareDraftModal';

/** Hook for opening the compare draft modal. */
export function useCompareDraftModal(props: CompareDraftModalProps) {
  // Degrade gracefully when rendered outside a `ModalsProvider` (e.g. visual
  // tests that render badges in isolation).
  let modals: ReturnType<typeof useModals> | null = null;
  try {
    modals = useModals();
  } catch {
    modals = null;
  }
  return {
    enabled: modals !== null,
    open: () => {
      if (!modals) {
        console.warn(
          'useCompareDraftModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(COMPARE_DRAFT_MODAL_ID, {
        title: `Unpublished changes: ${props.docId}`,
        innerProps: props,
        overflow: 'inside',
        size: 'min(calc(100% - 32px), 900px)',
      });
    },
  };
}
