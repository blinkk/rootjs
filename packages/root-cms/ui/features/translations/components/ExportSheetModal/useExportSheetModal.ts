import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {ExportSheetModalProps} from './ExportSheetModal.js';

export const EXPORT_SHEET_MODAL_ID = 'ExportSheetModal';

/** Hook for opening the export sheet modal. */
export function useExportSheetModal() {
  const modals = useModals();
  return {
    open: (props: ExportSheetModalProps) => {
      modals.openContextModal(EXPORT_SHEET_MODAL_ID, {
        title: 'Export to Google Sheet',
        innerProps: props,
        size: '650px',
      });
    },
  };
}
