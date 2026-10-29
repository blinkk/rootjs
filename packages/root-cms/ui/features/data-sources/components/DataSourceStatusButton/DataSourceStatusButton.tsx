import {Timestamp} from 'firebase/firestore';
import {useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {TimeSinceActionTooltip} from '../../../../components/TimeSinceActionTooltip/TimeSinceActionTooltip.js';
import {useGapiClient} from '../../../../integrations/useGapiClient.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {
  DataSource,
  publishDataSource,
  syncDataSource,
} from '../../data-source.js';

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

  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);
  const isPublishAction = props.action === 'publish';
  const isArchived = Boolean(dataSource.archivedAt);

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
    <div className="DataSourceStatusButton flex items-center gap-2">
      <div className="DataSourceStatusButton__label">
        {!loading && (
          <TimeSinceActionTooltip timestamp={timestamp} email={email} />
        )}
      </div>
      <div className="DataSourceStatusButton__button">
        <ConditionalTooltip
          label={
            isArchived
              ? 'Data source is archived'
              : "You don't have access to publish this data source"
          }
          condition={isArchived || (isPublishAction && !canPublish)}
        >
          <Tooltip
            label={buttonTooltip}
            disabled={isArchived || (isPublishAction && !canPublish)}
          >
            <Button
              variant="default"
              size="xs"
              onClick={() => onClick()}
              loading={loading}
              disabled={isArchived || (isPublishAction && !canPublish)}
            >
              {props.action}
            </Button>
          </Tooltip>
        </ConditionalTooltip>
      </div>
    </div>
  );
}
