import './DataPage.css';

import {
  ActionIcon,
  Button,
  Loader,
  Switch,
  Table,
  Tooltip,
} from '@mantine/core';
import {IconTable} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DataSourceStatusBadge} from '../../components/DataSourceStatusBadge/DataSourceStatusBadge.js';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {DataSource, listDataSources} from '../../utils/data-source.js';
import {testCanEdit} from '../../utils/permissions.js';

export function DataPage() {
  usePageTitle('Data Sources');
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);

  return (
    <Layout>
      <div className="DataPage">
        <div className="DataPage__header">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p">
            Add data sources to sync data from external services, like Google
            Sheets.
          </Text>
          <div className="DataPage__header__buttons">
            <ConditionalTooltip
              label="You don't have access to create new data sources"
              condition={!canEdit}
            >
              <Button
                component="a"
                color="blue"
                size="xs"
                href="/cms/data/new"
                disabled={!canEdit}
                style={!canEdit ? {pointerEvents: 'none'} : undefined}
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
    const dataSources = await listDataSources();
    setTableData(dataSources);
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
      {loading && <Loader color="gray" size="xl" />}
      {!loading && (
        <>
          {hasArchived && (
            <div className="DataPage__DataSourcesTable__filters">
              <Switch
                size="sm"
                color="dark"
                label="Show archived"
                checked={showArchived}
                onChange={(e: any) =>
                  setShowArchived(Boolean(e.currentTarget.checked))
                }
              />
            </div>
          )}
          {filteredDataSources.length > 0 && (
            <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
              <thead>
                <tr>
                  <th>id</th>
                  <th>description</th>
                  <th>type</th>
                  <th>url</th>
                  <th>status</th>
                  <th>last synced</th>
                  <th>last published</th>
                </tr>
              </thead>
              <tbody>
                {filteredDataSources.map((dataSource) => (
                  <tr key={dataSource.id}>
                    <td>
                      <a href={`/cms/data/${dataSource.id}`}>{dataSource.id}</a>
                    </td>
                    <td>{dataSource.description || ''}</td>
                    <td>{dataSource.type}</td>
                    <td>
                      {isGoogleSheetUrl(dataSource.url) ? (
                        <div className="DataPage__DataSourcesTable__url">
                          <Tooltip label="Open spreadsheet">
                            <ActionIcon<'a'>
                              component="a"
                              href={dataSource.url}
                              target="_blank"
                              rel="noreferrer"
                              variant="filled"
                              color="green"
                              size="sm"
                              aria-label="Open spreadsheet"
                            >
                              <IconTable size={16} stroke="2.25" />
                            </ActionIcon>
                          </Tooltip>
                          <a
                            className="DataPage__DataSourcesTable__url__text"
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
                    </td>
                    <td>
                      <DataSourceStatusBadge dataSource={dataSource} />
                    </td>
                    <td>
                      <DataSourceStatusButton
                        dataSource={dataSource}
                        action="sync"
                      />
                    </td>
                    <td>
                      <DataSourceStatusButton
                        dataSource={dataSource}
                        action="publish"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {filteredDataSources.length === 0 && (
            <Text as="p">No data sources found for this filter.</Text>
          )}
        </>
      )}
    </div>
  );
};
