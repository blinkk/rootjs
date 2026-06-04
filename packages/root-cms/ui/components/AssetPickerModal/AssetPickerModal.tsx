import {ContextModalProps, useModals} from '@mantine/modals';
import {useState} from 'preact/hooks';
import {Asset} from '../../../shared/asset.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {AssetBrowser} from '../AssetBrowser/AssetBrowser.js';

const MODAL_ID = 'AssetPickerModal';

export interface AssetPickerModalProps {
  [key: string]: unknown;
  /** Restrict the picker to these file exts/mimetypes. */
  accept?: string[];
  /** Folder to open initially. */
  initialDir?: string;
  /** Called with the chosen asset; the modal closes afterwards. */
  onSelect: (asset: Asset) => void;
}

export function useAssetPickerModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: AssetPickerModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Choose from asset library',
        innerProps: props,
        size: '760px',
        overflow: 'inside',
      });
    },
    close: () => modals.closeModal(MODAL_ID),
  };
}

export function AssetPickerModal(
  modalProps: ContextModalProps<AssetPickerModalProps>
) {
  const {innerProps} = modalProps;
  const [currentDir, setCurrentDir] = useState(innerProps.initialDir || '/');
  return (
    <div className="AssetPickerModal">
      <AssetBrowser
        currentDir={currentDir}
        onNavigate={setCurrentDir}
        accept={innerProps.accept}
        onSelect={(asset: Asset) => {
          innerProps.onSelect(asset);
          modalProps.context.closeModal(modalProps.id);
        }}
      />
    </div>
  );
}

AssetPickerModal.id = MODAL_ID;
