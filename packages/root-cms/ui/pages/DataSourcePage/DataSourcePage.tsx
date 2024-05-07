import {
  ActionIcon,
  Breadcrumbs,
  Button,
  JsonInput,
  Loader,
  Table,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {IconSettings, IconTable} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {DataSourceStatusButton} from '../../components/DataSourceStatusButton/DataSourceStatusButton.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {
  DataSourceData,
  DataSource,
  getFromDataSource,
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
      const data = await getFromDataSource(id, {mode: 'draft'});
      setData(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  function onAction(action: string) {
    if (action === 'sync') {
      // When data is synced, re-fetch data from the data source.
      init();
    }
  }

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

        {dataSource && (
          <DataSourcePage.SyncStatus
            dataSource={dataSource}
            onAction={onAction}
          />
        )}

        {loading ? (
          <Loader color="gray" size="xl" />
        ) : dataSource ? (
          <DataSourcePage.DataSection dataSource={dataSource} data={data} />
        ) : (
          <div className="DataSourcePage__notFound">Not Found</div>
        )}
      </div>
    </Layout>
  );
}

DataSourcePage.SyncStatus = (props: {
  dataSource: DataSource;
  onAction?: (action: string) => void;
}) => {
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
                  if (props.onAction) {
                    props.onAction('sync');
                  }
                }}
              />
            </td>
            <td>
              <DataSourceStatusButton
                dataSource={dataSource}
                action="publish"
              />
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
};

DataSourcePage.DataSection = (props: {
  dataSource: DataSource;
  data: DataSourceData;
}) => {
  const {data} = props.data || {};
  const dataSource = props.dataSource;

  if (!data) {
    return null;
  }

  const dataFormat = dataSource.dataFormat || 'map';
  if (dataSource.type === 'gsheet') {
    let headers: string[] | undefined = undefined;
    let rows: any[] = [];
    if (dataFormat === 'array') {
      rows = data as string[][];
    } else if (dataFormat === 'map') {
      // Reformat Array<Record<string, string>> to string[][].
      const headersSet = new Set<string>();
      const items = data as any[];
      items.forEach((item) => {
        for (const key in item) {
          if (key) {
            headersSet.add(key);
          }
        }
      });
      headers = Array.from(headersSet);
      items.forEach((item) => {
        rows.push(headers!.map((header) => item[header] || ''));
      });
    }
    return (
      <DataSourcePage.DataSectionWrap dataSource={dataSource}>
        <DataSourcePage.DataTable headers={headers} rows={rows} />
      </DataSourcePage.DataSectionWrap>
    );
  }

  if (dataSource.type === 'http') {
    return (
      <DataSourcePage.DataSectionWrap dataSource={dataSource}>
        <DataSourcePage.DefaultDataDisplay data={data} />
      </DataSourcePage.DataSectionWrap>
    );
  }

  console.log(`unsupported data type: ${dataSource.type}`);
  return null;
};

DataSourcePage.DataSectionWrap = (props: {
  dataSource: DataSource;
  children: ComponentChildren;
}) => {
  return (
    <div className="DataSourcePage__DataSection">
      <div className="DataSourcePage__DataSection__header">
        <Heading size="h2">Data</Heading>
        <div className="DataSourcePage__DataSection__header__actions">
          {props.dataSource.url?.startsWith(
            'https://docs.google.com/spreadsheets/'
          ) && (
            <Tooltip label="Open spreadsheet">
              <ActionIcon<'a'>
                component="a"
                href={props.dataSource.url}
                target="_blank"
                variant="filled"
                color="green"
              >
                <IconTable size={16} stroke="2.25" />
              </ActionIcon>
            </Tooltip>
          )}
          {props.dataSource.previewUrl && (
            <Button
              component="a"
              variant="default"
              size="xs"
              href={props.dataSource.previewUrl}
              target="_blank"
            >
              Preview
            </Button>
          )}
        </div>
      </div>
      {props.children}
    </div>
  );
};

DataSourcePage.DataTable = (props: {headers?: string[]; rows?: string[][]}) => {
  const headers = props.headers || [];
  const rows = props.rows || [];

  return (
    <div className="DataSourcePage__DataTable">
      <Table
        className="DataSourcePage__DataTable__table"
        verticalSpacing="xs"
        striped
        highlightOnHover
        fontSize="xs"
      >
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

DataSourcePage.DefaultDataDisplay = (props: {data: any}) => {
  const data = props.data;
  if (typeof data === 'object') {
    return (
      <JsonInput
        value={JSON.stringify(data, null, 2)}
        minRows={20}
        maxRows={100}
      />
    );
  }
  return <Textarea value={String(data)} minRows={12} maxRows={100} />;
};
