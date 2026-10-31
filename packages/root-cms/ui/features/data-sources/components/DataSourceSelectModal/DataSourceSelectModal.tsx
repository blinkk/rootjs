import {useEffect, useState} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import type {ContextModalProps} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {DataSource, listDataSources} from '../../data-source.js';
import {DataSourceIcon} from '../DataSourceIcon/DataSourceIcon.js';
import {DATA_SOURCE_SELECT_MODAL_ID} from './useDataSourceSelectModal.js';

export interface DataSourceSelectModalProps {
  [key: string]: unknown;
  onChange?: (id: string, selected: boolean) => void | Promise<void>;
  selectedDataSourceIds?: string[];
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
      await notifyErrors(async () => {
        const res = await withTimeout(
          listDataSources(),
          undefined,
          'loading data sources'
        );
        setDataSources(res.filter((ds) => !ds.archivedAt));
      });
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
        <div className="DataSourceSelectModal__loading flex justify-center p-5 text-muted">
          <Spinner size="lg" />
        </div>
      ) : dataSources.length === 0 ? (
        <div className="DataSourceSelectModal__empty text-base">
          No data sources.
        </div>
      ) : (
        <div className="DataSourceSelectModal__list border-0 border-t border-solid border-border">
          {dataSources.map((ds) => (
            <div
              key={ds.id}
              className="DataSourceSelectModal__item flex items-center gap-3 border-0 border-b border-solid border-border py-3"
            >
              <DataSourceIcon
                className="DataSourceSelectModal__item__icon"
                type={ds.type}
              />
              <div className="DataSourceSelectModal__item__info min-w-0 flex-1">
                <div className="DataSourceSelectModal__item__id break-words text-lg font-semibold leading-snug">
                  {ds.id}
                </div>
                {ds.description && (
                  <div className="DataSourceSelectModal__item__description mt-0.5 text-base text-muted">
                    {ds.description}
                  </div>
                )}
              </div>
              <div className="DataSourceSelectModal__item__action shrink-0">
                {selectedIds.includes(ds.id) ? (
                  <Button
                    variant="blue-light"
                    onClick={() => onUnselect(ds.id)}
                  >
                    Unselect
                  </Button>
                ) : (
                  <Button variant="blue" onClick={() => onSelect(ds.id)}>
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

DataSourceSelectModal.id = DATA_SOURCE_SELECT_MODAL_ID;
