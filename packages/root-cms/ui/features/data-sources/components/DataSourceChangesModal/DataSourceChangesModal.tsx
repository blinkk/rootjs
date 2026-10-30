import {useEffect, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {
  DataTableDiff,
  diffDataTables,
  toDataTable,
} from '../../data-source-diff.js';
import {
  DataSource,
  DataSourceData,
  getFromDataSource,
} from '../../data-source.js';
import {useDataSourceAction} from '../../useDataSourceAction.js';

/**
 * Returns a function that opens a modal comparing a data source's synced
 * (draft) data with its published data.
 */
export function useDataSourceChangesModal() {
  const modals = useModals();
  return {
    open: (dataSource: DataSource, options?: {onPublish?: () => void}) => {
      const modalId = modals.openModal({
        title: `Unpublished changes in ${dataSource.id}`,
        size: 'xl',
        children: (
          <DataSourceChangesModal
            dataSource={dataSource}
            onClose={() => modals.closeModal(modalId)}
            onPublish={() => {
              modals.closeModal(modalId);
              options?.onPublish?.();
            }}
          />
        ),
      });
    },
  };
}

interface DataSourceChangesModalProps {
  dataSource: DataSource;
  onClose: () => void;
  onPublish: () => void;
}

/** The body of the changes modal, with Close and Publish in its footer. */
export function DataSourceChangesModal(props: DataSourceChangesModalProps) {
  const dataSource = props.dataSource;
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DataSourceData | null>(null);
  const [published, setPublished] = useState<DataSourceData | null>(null);
  const publish = useDataSourceAction(dataSource, 'publish', props.onPublish);
  const {roles} = useProjectRoles();
  const canPublish = testCanPublish(roles, window.firebase.user.email || '');

  useEffect(() => {
    notifyErrors(async () => {
      const [draftData, publishedData] = await Promise.all([
        getFromDataSource(dataSource.id, {mode: 'draft'}),
        getFromDataSource(dataSource.id, {mode: 'published'}),
      ]);
      setDraft(draftData);
      setPublished(publishedData);
    }).finally(() => setLoading(false));
  }, [dataSource.id]);

  return (
    <div className="DataSourceChangesModal">
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="DataSourceChangesModal__summary mb-4 mt-0"
      >
        Synced {formatTimeAgo(dataSource.syncedAt)}, compared with what was
        published {formatTimeAgo(dataSource.publishedAt)}.
      </Text>
      {loading ? (
        <div className="DataSourceChangesModal__loading flex justify-center p-5 text-muted">
          <Spinner size="lg" />
        </div>
      ) : dataSource.type === 'gsheet' ? (
        <DataSourceChangesModal.TableDiff
          diff={diffDataTables(
            toDataTable(
              dataSource.dataFormat,
              published?.data,
              published?.headers
            ),
            toDataTable(dataSource.dataFormat, draft?.data, draft?.headers)
          )}
        />
      ) : (
        <JsDiff
          className="DataSourceChangesModal__jsonDiff"
          oldCode={stringifyData(published?.data)}
          newCode={stringifyData(draft?.data)}
        />
      )}
      <DialogFooter>
        <Button onClick={() => props.onClose()}>Close</Button>
        <ConditionalTooltip
          label="You don't have access to publish this data source"
          condition={!canPublish}
        >
          <Button
            variant="blue"
            loading={publish.loading}
            disabled={!canPublish}
            onClick={() => publish.run()}
          >
            Publish changes
          </Button>
        </ConditionalTooltip>
      </DialogFooter>
    </div>
  );
}

/** Lists the rows that differ, marking changed cells as old → new. */
DataSourceChangesModal.TableDiff = (props: {diff: DataTableDiff}) => {
  const diff = props.diff;
  if (diff.rows.length === 0) {
    return (
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="DataSourceChangesModal__noChanges m-0 rounded-lg border border-dashed border-border-strong px-5 py-8 text-center"
      >
        The synced data is the same as the published data.
      </Text>
    );
  }
  return (
    <div className="DataSourceChangesModal__tableDiff">
      <div className="DataSourceChangesModal__counts mb-3 flex flex-wrap gap-4 text-sm font-semibold">
        <span className="text-success">{diff.added} added</span>
        <span className="text-warning">{diff.changed} changed</span>
        <span className="text-danger">{diff.removed} removed</span>
      </div>
      <div className="DataSourceChangesModal__tableWrap overflow-x-auto rounded-lg border border-border">
        <table className="DataSourceChangesModal__table w-full border-collapse font-mono text-sm">
          <thead>
            <tr>
              <th className="DataSourceChangesModal__th whitespace-nowrap border-b border-border bg-surface-hover px-2.5 py-2 text-left font-sans font-medium text-muted">
                Row
              </th>
              {diff.headers.map((header) => (
                <th
                  key={header}
                  className="DataSourceChangesModal__th whitespace-nowrap border-b border-border bg-surface-hover px-2.5 py-2 text-left font-medium text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diff.rows.map((row) => (
              <tr
                key={`${row.type}-${row.index}`}
                className={cn(
                  'DataSourceChangesModal__row',
                  `DataSourceChangesModal__row--${row.type}`,
                  row.type === 'added' && 'bg-success-soft',
                  row.type === 'removed' && 'bg-danger-soft text-danger'
                )}
              >
                <td className="DataSourceChangesModal__rowNumber whitespace-nowrap border-b border-surface-active px-2.5 py-2 align-top font-sans text-muted">
                  {row.type === 'added'
                    ? '+'
                    : row.type === 'removed'
                      ? '−'
                      : ''}
                  {/* Sheet row numbers start at 2, after the header row. */}
                  {row.index + 2}
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      'DataSourceChangesModal__cell max-w-60 border-b border-surface-active px-2.5 py-2 align-top wrap-anywhere',
                      row.type === 'removed' && 'line-through'
                    )}
                  >
                    {cell.oldValue !== undefined ? (
                      <>
                        <span className="DataSourceChangesModal__oldValue block text-danger line-through">
                          {cell.oldValue}
                        </span>
                        <span className="DataSourceChangesModal__newValue block rounded-sm bg-success-soft px-0.5 text-success">
                          {cell.value}
                        </span>
                      </>
                    ) : (
                      cell.value
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function stringifyData(data: unknown): string {
  if (data === undefined || data === null) {
    return '';
  }
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function formatTimeAgo(ts?: {toMillis?: () => number}): string {
  const millis = ts?.toMillis?.();
  return millis ? getTimeAgo(millis) : 'never';
}
