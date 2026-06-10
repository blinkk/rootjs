import './AssetPickerModal.css';

import {ContextModalProps, useModals} from '@mantine/modals';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {AssetFile, setAssetPickerLastFolder} from '../../utils/assets.js';
import {AssetBrowser} from '../AssetBrowser/AssetBrowser.js';

const MODAL_ID = 'AssetPickerModal';

export interface AssetPickerModalProps {
  [key: string]: unknown;
  /** Called when the user selects a file from the asset library. */
  onSelect?: (asset: AssetFile) => void;
  /** Accept list used to filter pickable files, e.g. `['image/png', '.mp4']`. */
  accept?: string[];
  /** Folder path the picker opens to. Defaults to the project root. */
  initialFolder?: string;
}

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
  const modalTheme = useModalTheme();
  return {
    enabled: modals !== null,
    open: (props: AssetPickerModalProps) => {
      if (!modals) {
        console.warn(
          'useAssetPickerModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Select from asset library',
        innerProps: props,
        size: '800px',
        overflow: 'inside',
      });
    },
    close: () => {
      modals?.closeModal(MODAL_ID);
    },
  };
}

export function AssetPickerModal(
  modalProps: ContextModalProps<AssetPickerModalProps>
) {
  const {innerProps: props, context, id} = modalProps;

  function onPickFile(asset: AssetFile) {
    if (props.onSelect) {
      props.onSelect(asset);
    }
    context.closeModal(id);
  }

  return (
    <div className="AssetPickerModal">
      <AssetBrowser
        mode="pick"
        accept={props.accept}
        initialFolder={props.initialFolder}
        onFolderChange={setAssetPickerLastFolder}
        onPickFile={onPickFile}
      />
    </div>
  );
}

AssetPickerModal.id = MODAL_ID;
