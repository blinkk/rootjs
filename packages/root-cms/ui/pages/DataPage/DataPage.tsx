import {Button, Loader, Table, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {
  DataSource,
  listDataSources,
  publishDataSource,
  syncDataSource,
} from '../../utils/data-source.js';
import {getTimeAgo} from '../../utils/time.js';
import './DataPage.css';

export function DataPage() {
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
            <Button component="a" color="blue" size="xs" href="/cms/data/new">
              Add data source
            </Button>
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

  async function init() {
    const dataSources = await listDataSources();
    setTableData(dataSources);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="DataPage__DataSourcesTable">
      {loading && <Loader color="gray" size="xl" />}
      {tableData.length > 0 && (
        <Table verticalSpacing="xs" striped highlightOnHover fontSize="xs">
          <thead>
            <tr>
              <th>id</th>
              <th>description</th>
              <th>type</th>
              <th>url</th>
              <th>last synced</th>
              <th>last published</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((dataSource) => (
              <tr key={dataSource.id}>
                <td>
                  <a href={`/cms/data/${dataSource.id}`}>{dataSource.id}</a>
                </td>
                <td>{dataSource.description || ''}</td>
                <td>{dataSource.type}</td>
                <td>{dataSource.url}</td>
                <td>
                  <DataPage.StatusButton
                    id={dataSource.id}
                    timestamp={dataSource.syncedAt}
                    email={dataSource.syncedBy}
                    action="sync"
                  />
                </td>
                <td>
                  <DataPage.StatusButton
                    id={dataSource.id}
                    timestamp={dataSource.publishedAt}
                    email={dataSource.publishedBy}
                    action="publish"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};

function timestampToMillis(ts?: Timestamp) {
  if (!ts) {
    return 0;
  }
  return ts.toMillis();
}

interface TimeSinceProps {
  timestamp?: number;
  email?: string;
}

function TimeSince(props: TimeSinceProps) {
  if (!props.timestamp) {
    return <div>never</div>;
  }
  return (
    <Tooltip
      transition="pop"
      label={`${formatDateTime(props.timestamp)} by ${props.email}`}
    >
      {getTimeAgo(props.timestamp, {style: 'short'})}
    </Tooltip>
  );
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface StatusButtonProps {
  id: string;
  timestamp?: Timestamp;
  email?: string;
  action: 'sync' | 'publish';
}

DataPage.StatusButton = (props: StatusButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [timestamp, setTimestamp] = useState(props.timestamp);
  const [email, setEmail] = useState(props.email);

  async function onClick() {
    setLoading(true);
    if (props.action === 'sync') {
      await syncDataSource(props.id);
    } else if (props.action === 'publish') {
      await publishDataSource(props.id);
    }
    setTimestamp(Timestamp.now());
    setEmail(window.firebase.user.email!);
    setLoading(false);
  }

  let buttonTooltip = '';
  if (props.action === 'sync') {
    buttonTooltip = 'Sync data to a draft state';
  } else if (props.action === 'publish') {
    buttonTooltip = 'Publish synced data to prod';
  }

  return (
    <div className="DataPage__DataSourcesTable__colWithButtons">
      <div className="DataPage__DataSourcesTable__colWithButtons__label">
        {!loading && (
          <TimeSince timestamp={timestampToMillis(timestamp)} email={email} />
        )}
      </div>
      <div className="DataPage__DataSourcesTable__colWithButtons__buttons">
        <Tooltip transition="pop" label={buttonTooltip}>
          <Button
            variant="default"
            size="xs"
            compact
            onClick={() => onClick()}
            loading={loading}
          >
            {props.action}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
