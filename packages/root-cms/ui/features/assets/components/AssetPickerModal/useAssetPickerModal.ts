import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {AssetPickerModalProps} from './AssetPickerModal.js';

export const ASSET_PICKER_MODAL_ID = 'AssetPickerModal';

/**
 * Hook for opening the asset picker modal, which allows users to select a
 * file from the project's asset library (e.g. for image/file fields).
 */
export function useAssetPickerModal() {
  // Degrade gracefully when used outside a `ModalsProvider` (e.g. the
  // standalone `FileUploader` component rendered in a non-CMS context).
  let modals: ReturnType<typeof useModals> | null = null;
  try {
    modals = useModals();
  } catch {
    modals = null;
  }
  return {
    enabled: modals !== null,
    open: (props: AssetPickerModalProps) => {
      if (!modals) {
        console.warn(
          'useAssetPickerModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(ASSET_PICKER_MODAL_ID, {
        title: 'Select from asset library',
        innerProps: props,
        size: '800px',
        overflow: 'inside',
      });
    },
    close: () => {
      modals?.closeModal(ASSET_PICKER_MODAL_ID);
    },
  };
}
