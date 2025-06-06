import {Button, Loader} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {useEffect, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {DataSource, listDataSources} from '../../utils/data-source.js';
import './DataSourceSelectModal.css';

const MODAL_ID = 'DataSourceSelectModal';

export interface DataSourceSelectModalProps {
  [key: string]: unknown;
  onChange?: (id: string, selected: boolean) => void | Promise<void>;
  selectedDataSourceIds?: string[];
}

export function useDataSourceSelectModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: DataSourceSelectModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: '600px',
        overflow: 'inside',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function DataSourceSelectModal(
  modalProps: ContextModalProps<DataSourceSelectModalProps>
) {
  const {innerProps: props} = modalProps;
  const [loading, setLoading] = useState(true);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const selectedIds = props.selectedDataSourceIds || [];

  useEffect(() => {
    async function init() {
      const res = await listDataSources();
      setDataSources(res);
      setLoading(false);
    }
    init();
  }, []);

  function onSelect(id: string) {
    if (props.onChange) {
      props.onChange(id, true);
    }
  }

  function onUnselect(id: string) {
    if (props.onChange) {
      props.onChange(id, false);
    }
  }

  return (
    <div className="DataSourceSelectModal">
      {loading ? (
        <div className="DataSourceSelectModal__loading">
          <Loader color="gray" size="xl" />
        </div>
      ) : dataSources.length === 0 ? (
        <div className="DataSourceSelectModal__empty">No data sources.</div>
      ) : (
        <div className="DataSourceSelectModal__list">
          {dataSources.map((ds) => (
            <div key={ds.id} className="DataSourceSelectModal__item">
              <div className="DataSourceSelectModal__item__info">
                <div className="DataSourceSelectModal__item__id">{ds.id}</div>
                <div className="DataSourceSelectModal__item__description">
                  {ds.description || ''}
                </div>
              </div>
              <div className="DataSourceSelectModal__item__action">
                {selectedIds.includes(ds.id) ? (
                  <Button
                    variant="light"
                    color="blue"
                    size="xs"
                    onClick={() => onUnselect(ds.id)}
                  >
                    Unselect
                  </Button>
                ) : (
                  <Button
                    variant="filled"
                    color="blue"
                    size="xs"
                    onClick={() => onSelect(ds.id)}
                  >
                    Select
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

DataSourceSelectModal.id = MODAL_ID;
