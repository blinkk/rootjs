import {ActionIcon, Breadcrumbs, Loader, Table, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconArrowUpRight, IconSettings, IconTable} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {
  Data,
  DataSource,
  getData,
  getDataSource,
} from '../../utils/data-source.js';
import './DataSourcePage.css';

export function DataSourcePage(props: {id: string}) {
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [data, setData] = useState<any>(null);
  const id = props.id;

  async function init() {
    const dataSource = await getDataSource(id);
    setDataSource(dataSource);
    if (dataSource) {
      const data = await getData(id, {mode: 'draft'});
      console.log(data);
      setData(data);
    }
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
          <DataSourcePage.DataTable dataSource={dataSource} data={data} />
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

DataSourcePage.DataTable = (props: {dataSource: DataSource; data: Data}) => {
  const {data, dataSource} = props.data;

  if (!data) {
    return null;
  }

  // TODO(stevenle): support other data formats.
  const dataFormat = dataSource.dataFormat || 'map';
  if (dataSource.type !== 'gsheet' || dataFormat !== 'map') {
    return null;
  }

  const headers = new Set<string>();
  const rows = data as any[];
  rows.forEach((row) => {
    for (const key in row) {
      if (key) {
        headers.add(key);
      }
    }
  });

  return (
    <div className="DataSourcePage__DataTable">
      <div className="DataSourcePage__DataTable__header">
        <Heading size="h2">Data</Heading>
        {dataSource.url?.startsWith(
          'https://docs.google.com/spreadsheets/'
        ) && (
          <Tooltip label="Open spreadsheet">
            <ActionIcon<'a'>
              component="a"
              href={dataSource.url}
              target="_blank"
              variant="filled"
              color="green"
            >
              <IconTable size={16} stroke="2.25" />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <Table
        className="DataSourcePage__DataTable__table"
        verticalSpacing="xs"
        striped
        highlightOnHover
        fontSize="xs"
      >
        <thead>
          <tr>
            {Array.from(headers).map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              {Array.from(headers).map((header) => (
                <td>{row[header] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
