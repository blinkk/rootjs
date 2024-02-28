import {ActionIcon, Breadcrumbs, Loader, Table, Tooltip} from '@mantine/core';
import {IconSettings} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {DataSource, getDataSource} from '../../utils/data-source.js';
import './DataSourcePage.css';
import {showNotification} from '@mantine/notifications';

export function DataSourcePage(props: {id: string}) {
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const id = props.id;

  async function init() {
    const dataSource = await getDataSource(id);
    console.log(dataSource);
    setDataSource(dataSource);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  return (
    <Layout>
      <div className="DataSourcePage">
        <div className="DataSourcePage__header">
          <Breadcrumbs className="DataSourcePage__header__breadcrumbs">
            <a href="/cms/data">Data</a>
            <div>{id}</div>
          </Breadcrumbs>
          <div className="DataSourcePage__header__titleWrap">
            <Heading size="h1">Data Source: {id}</Heading>
            <div className="DataSourcePage__header__controls">
              <Tooltip label="Configure">
                <ActionIcon component="a" href={`/cms/data/${props.id}/edit`}>
                  <IconSettings size={24} stroke="1.5" />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
          {dataSource?.description && (
            <Text as="p">{dataSource.description}</Text>
          )}
        </div>

        {dataSource && <DataSourcePage.SyncStatus dataSource={dataSource} />}

        {loading ? (
          <Loader color="gray" size="xl" />
        ) : dataSource ? (
          <DataSourcePage.DataTable />
        ) : (
          <div className="DataSourcePage__notFound">Not Found</div>
        )}
      </div>
    </Layout>
  );
}

DataSourcePage.SyncStatus = (props: {dataSource: DataSource}) => {
  const dataSource = props.dataSource;
  return (
    <div className="DataSourcePage__SyncStatus">
      <Heading size="h2">Status</Heading>
      <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
        <thead>
          <tr>
            <th>last synced</th>
            <th>last published</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <DataSourceStatusButton
                dataSource={dataSource}
                action="sync"
                onAction={() => {
                  showNotification({
                    title: 'Data synced',
                    message: `Synced ${dataSource.id} to draft data.`,
                    autoClose: 5000,
                  });
                }}
              />
            </td>
            <td>
              <DataSourceStatusButton
                dataSource={dataSource}
                action="publish"
                onAction={() => {
                  showNotification({
                    title: 'Data published',
                    message: `Published ${dataSource.id}.`,
                    autoClose: 5000,
                  });
                }}
              />
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
};

DataSourcePage.DataTable = () => {
  return (
    <div className="DataSourcePage__DataTable">
      <Heading size="h2">Data</Heading>
    </div>
  );
};
