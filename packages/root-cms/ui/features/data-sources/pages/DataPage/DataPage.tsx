import {IconTable} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Switch} from '../../../../primitives/Switch/Switch.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanEdit} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DataSourceStatusBadge} from '../../components/DataSourceStatusBadge/DataSourceStatusBadge.js';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {DataSource, listDataSources} from '../../data-source.js';

/** Cells cap their width and truncate, like the old table. */
const CELL_CLASSES = 'max-w-88 overflow-hidden text-ellipsis';

/** The green "open spreadsheet" button, as in Mantine's filled green. */
const SHEET_BUTTON_CLASSES =
  'bg-success text-inverse hover:bg-success hover:brightness-90 active:bg-success';

export function DataPage() {
  usePageTitle('Data Sources');
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);

  return (
    <Layout>
      <div className="DataPage bg-page p-(--cms-page-padding-mobile) md:p-(--cms-page-padding)">
        <div className="DataPage__header mb-10">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p" className="mt-2 max-w-prose">
            Add data sources to sync data from external services, like Google
            Sheets.
          </Text>
          <div className="DataPage__header__buttons mt-5">
            <ConditionalTooltip
              label="You don't have access to create new data sources"
              condition={!canEdit}
            >
              <Button
                variant="primary"
                href="/cms/data/new"
                disabled={!canEdit}
              >
                New data source
              </Button>
            </ConditionalTooltip>
          </div>
        </div>
        <DataPage.DataSourcesTable />
      </div>
    </Layout>
  );
}

DataPage.DataSourcesTable = () => {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<DataSource[]>([]);
  const [showArchived, setShowArchived] = useLocalStorage<boolean>(
    'root::DataPage:showArchived',
    false
  );
  const isGoogleSheetUrl = (url?: string | null) =>
    !!url && url.startsWith('https://docs.google.com/spreadsheets/');

  async function init() {
    await notifyErrors(async () => {
      const dataSources = await withTimeout(
        listDataSources(),
        undefined,
        'loading data sources'
      );
      setTableData(dataSources);
    });
    setLoading(false);
  }

  const hasArchived = useMemo(
    () => tableData.some((dataSource) => Boolean(dataSource.archivedAt)),
    [tableData]
  );

  const filteredDataSources = useMemo(() => {
    return tableData.filter((dataSource) => {
      const isArchived = Boolean(dataSource.archivedAt);
      if (!showArchived) {
        return !isArchived;
      }
      return true;
    });
  }, [tableData, showArchived]);

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="DataPage__DataSourcesTable">
      {!loading && hasArchived && (
        <div className="DataPage__DataSourcesTable__filters mb-5 flex justify-end">
          <Switch
            label="Show archived"
            checked={showArchived}
            onChange={(e: any) =>
              setShowArchived(Boolean(e.currentTarget.checked))
            }
          />
        </div>
      )}
      <Surface>
        {loading && (
          <div className="DataPage__loading flex justify-center p-5 text-muted">
            <Spinner size="lg" />
          </div>
        )}
        {!loading && filteredDataSources.length > 0 && (
          <Table
            dense
            striped
            hover
            stickyFirstColumn
            label="Data sources"
            className="rounded-none border-0"
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>id</TableHeaderCell>
                <TableHeaderCell>description</TableHeaderCell>
                <TableHeaderCell>type</TableHeaderCell>
                <TableHeaderCell>url</TableHeaderCell>
                <TableHeaderCell>status</TableHeaderCell>
                <TableHeaderCell>last synced</TableHeaderCell>
                <TableHeaderCell>last published</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDataSources.map((dataSource) => (
                <TableRow key={dataSource.id}>
                  <TableCell className={cn(CELL_CLASSES, 'whitespace-nowrap')}>
                    <a href={`/cms/data/${dataSource.id}`}>{dataSource.id}</a>
                  </TableCell>
                  <TableCell className={cn(CELL_CLASSES, 'min-w-40')}>
                    {dataSource.description || ''}
                  </TableCell>
                  <TableCell className={CELL_CLASSES}>
                    {dataSource.type}
                  </TableCell>
                  <TableCell className={CELL_CLASSES}>
                    {isGoogleSheetUrl(dataSource.url) ? (
                      <div className="DataPage__DataSourcesTable__url flex items-center gap-1.5">
                        <IconButton
                          href={dataSource.url!}
                          target="_blank"
                          rel="noreferrer"
                          size="xs"
                          label="Open spreadsheet"
                          className={SHEET_BUTTON_CLASSES}
                        >
                          <IconTable stroke="2.25" />
                        </IconButton>
                        <a
                          className="DataPage__DataSourcesTable__url__text inline-block truncate"
                          href={dataSource.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {dataSource.url}
                        </a>
                      </div>
                    ) : (
                      dataSource.url || ''
                    )}
                  </TableCell>
                  <TableCell className={CELL_CLASSES}>
                    <DataSourceStatusBadge dataSource={dataSource} />
                  </TableCell>
                  <TableCell className={CELL_CLASSES}>
                    <DataSourceStatusButton
                      dataSource={dataSource}
                      action="sync"
                    />
                  </TableCell>
                  <TableCell className={CELL_CLASSES}>
                    <DataSourceStatusButton
                      dataSource={dataSource}
                      action="publish"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && filteredDataSources.length === 0 && (
          <Text className="DataPage__emptyText p-5">
            No data sources found.
          </Text>
        )}
      </Surface>
    </div>
  );
};
