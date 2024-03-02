import {Button, Tooltip} from '@mantine/core';
import {showNotification, updateNotification} from '@mantine/notifications';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {useGapiClient} from '../../hooks/useGapiClient.js';
import {
  DataSource,
  publishDataSource,
  syncDataSource,
} from '../../utils/data-source.js';
import {getTimeAgo} from '../../utils/time.js';
import './DataSourceStatusButton.css';

export interface DataSourceStatusButtonProps {
  dataSource: DataSource;
  action: 'sync' | 'publish';
  onAction?: () => void;
}

export function DataSourceStatusButton(props: DataSourceStatusButtonProps) {
  const dataSource = props.dataSource;
  const [loading, setLoading] = useState(false);
  const [timestamp, setTimestamp] = useState(
    props.action === 'sync' ? dataSource.syncedAt : dataSource.publishedAt
  );
  const [email, setEmail] = useState(
    props.action === 'sync' ? dataSource.syncedBy : dataSource.publishedBy
  );
  const gapiClient = useGapiClient();

  async function onClick() {
    setLoading(true);

    const notificationId = `data-source-${props.action}-${dataSource.id}`;

    showNotification({
      id: notificationId,
      loading: true,
      title: `Running Data Source ${props.action}`,
      message: `Updating ${dataSource.id}...`,
      autoClose: false,
      disallowClose: true,
    });
    try {
      if (props.action === 'sync') {
        // The gsheet "sync" action requires a gapi access token, so ensure the
        // user has a token before syncing.
        if (dataSource.type === 'gsheet' && !gapiClient.isLoggedIn()) {
          await gapiClient.login();
        }
        await syncDataSource(dataSource.id);
      } else if (props.action === 'publish') {
        await publishDataSource(dataSource.id);
      }
      setTimestamp(Timestamp.now());
      setEmail(window.firebase.user.email!);
      setLoading(false);
      if (props.onAction) {
        props.onAction();
      }
      updateNotification({
        id: notificationId,
        title: 'Success',
        message: `Updated Data Source ${dataSource.id}`,
        autoClose: false,
      });
    } catch (err) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      setLoading(false);
      updateNotification({
        id: notificationId,
        title: `Data Source ${props.action} failed`,
        message: String(msg),
        color: 'red',
        autoClose: false,
      });
    }
  }

  let buttonTooltip = '';
  if (props.action === 'sync') {
    buttonTooltip = 'Sync data to a draft state';
  } else if (props.action === 'publish') {
    buttonTooltip = 'Publish synced data to prod';
  }

  return (
    <div className="DataSourceStatusButton">
      <div className="DataSourceStatusButton__label">
        {!loading && (
          <TimeSince timestamp={timestampToMillis(timestamp)} email={email} />
        )}
      </div>
      <div className="DataSourceStatusButton__button">
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
}

interface TimeSinceProps {
  timestamp?: number;
  email?: string;
}

function TimeSince(props: TimeSinceProps) {
  const [label, setLabel] = useState(
    props.timestamp ? getTimeAgo(props.timestamp, {style: 'short'}) : 'never'
  );

  if (!props.timestamp) {
    return <div>{label}</div>;
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLabel(getTimeAgo(props.timestamp!, {style: 'short'}));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

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

function timestampToMillis(ts?: Timestamp) {
  if (!ts) {
    return 0;
  }
  return ts.toMillis();
}
