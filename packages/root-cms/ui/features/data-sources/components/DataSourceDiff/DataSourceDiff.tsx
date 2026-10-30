import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {Text} from '../../../../components/Text/Text.js';
import {cn} from '../../../../utils/classes.js';
import {
  DataTableDiff,
  diffDataTables,
  toDataTable,
} from '../../data-source-diff.js';
import {DataSource, DataSourceData} from '../../data-source.js';

export interface DataSourceDiffProps {
  dataSource: DataSource;
  /** The synced (draft) data. */
  draft: DataSourceData | null;
  /** The published data. */
  published: DataSourceData | null;
}

/**
 * Shows how a data source's synced data differs from its published data: a
 * row diff for Google Sheets, or a JSON line diff for other sources.
 */
export function DataSourceDiff(props: DataSourceDiffProps) {
  const {dataSource, draft, published} = props;
  if (dataSource.type === 'gsheet') {
    return (
      <DataSourceDiff.TableDiff
        diff={diffDataTables(
          toDataTable(
            dataSource.dataFormat,
            published?.data,
            published?.headers
          ),
          toDataTable(dataSource.dataFormat, draft?.data, draft?.headers)
        )}
      />
    );
  }
  return (
    <JsDiff
      className="DataSourceDiff__jsonDiff"
      oldCode={stringifyData(published?.data)}
      newCode={stringifyData(draft?.data)}
    />
  );
}

/** Lists the rows that differ, marking changed cells as old → new. */
DataSourceDiff.TableDiff = (props: {diff: DataTableDiff}) => {
  const diff = props.diff;
  if (diff.rows.length === 0) {
    return (
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="DataSourceDiff__noChanges m-0 rounded-lg border border-dashed border-border-strong px-5 py-8 text-center"
      >
        The synced data is the same as the published data.
      </Text>
    );
  }
  return (
    <div className="DataSourceDiff__tableDiff">
      <div className="DataSourceDiff__counts mb-3 flex flex-wrap gap-4 text-sm font-semibold">
        <span className="text-success">{diff.added} added</span>
        <span className="text-warning">{diff.changed} changed</span>
        <span className="text-danger">{diff.removed} removed</span>
      </div>
      <div className="DataSourceDiff__tableWrap overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="DataSourceDiff__table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                className="DataSourceDiff__th whitespace-nowrap border-b border-border bg-surface-hover px-3 py-2 text-left font-medium text-muted"
                aria-label="Row"
              >
                #
              </th>
              {diff.headers.map((header) => (
                <th
                  key={header}
                  className="DataSourceDiff__th whitespace-nowrap border-b border-border bg-surface-hover px-3 py-2 text-left font-medium text-muted"
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
                  'DataSourceDiff__row last:*:border-b-0',
                  `DataSourceDiff__row--${row.type}`,
                  row.type === 'added' && 'bg-success-soft',
                  row.type === 'removed' && 'bg-danger-soft text-danger'
                )}
              >
                <td className="DataSourceDiff__rowNumber whitespace-nowrap border-b border-surface-active px-3 py-2 align-top text-muted">
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
                      'DataSourceDiff__cell max-w-60 border-b border-surface-active px-3 py-2 align-top wrap-anywhere',
                      row.type === 'removed' && 'line-through'
                    )}
                  >
                    {cell.oldValue !== undefined ? (
                      <>
                        <span className="DataSourceDiff__oldValue block text-danger line-through">
                          {cell.oldValue}
                        </span>
                        <span className="DataSourceDiff__newValue block rounded-sm bg-success-soft px-0.5 text-success">
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
