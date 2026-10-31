import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {DataSourceSelectModalProps} from './DataSourceSelectModal.js';

export const DATA_SOURCE_SELECT_MODAL_ID = 'DataSourceSelectModal';

/** Hook for opening the data source select modal. */
export function useDataSourceSelectModal() {
  const modals = useModals();
  return {
    open: (props: DataSourceSelectModalProps) => {
      modals.openContextModal(DATA_SOURCE_SELECT_MODAL_ID, {
        innerProps: props,
        size: '600px',
      });
    },
    close: () => {
      modals.closeModal(DATA_SOURCE_SELECT_MODAL_ID);
    },
  };
}
