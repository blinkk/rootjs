import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {AssetFile, setAssetPickerLastFolder} from '../../assets.js';
import {AssetBrowser} from '../AssetBrowser/AssetBrowser.js';
import {ASSET_PICKER_MODAL_ID} from './useAssetPickerModal.js';

export interface AssetPickerModalProps {
  [key: string]: unknown;
  /** Called when the user selects a file from the asset library. */
  onSelect?: (asset: AssetFile) => void;
  /** Accept list used to filter pickable files, e.g. `['image/png', '.mp4']`. */
  accept?: string[];
  /** Folder path the picker opens to. Defaults to the project root. */
  initialFolder?: string;
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
    <div className="AssetPickerModal min-h-80">
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

AssetPickerModal.id = ASSET_PICKER_MODAL_ID;
