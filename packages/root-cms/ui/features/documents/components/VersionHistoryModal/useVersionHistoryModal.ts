import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {VersionHistoryModalProps} from './VersionHistoryModal.js';

export const VERSION_HISTORY_MODAL_ID = 'VersionHistoryModal';

/**
 * Dispatched on `window` after a doc is restored to an earlier version. The
 * event detail is a {@link DocRestoredEventDetail}.
 */
export const DOC_RESTORED_EVENT = 'root:doc-restored';

export interface DocRestoredEventDetail {
  /** The id of the restored doc, e.g. `Pages/foo`. */
  docId: string;
}

/** Hook for opening the version history modal. */
export function useVersionHistoryModal(props: VersionHistoryModalProps) {
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
          'useVersionHistoryModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(VERSION_HISTORY_MODAL_ID, {
        title: `Version history: ${props.docId}`,
        innerProps: props,
        overflow: 'inside',
        size: 'min(calc(100% - 32px), 720px)',
      });
    },
  };
}
