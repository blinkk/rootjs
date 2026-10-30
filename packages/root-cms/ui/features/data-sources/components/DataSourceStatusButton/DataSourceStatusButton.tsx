import {Timestamp} from 'firebase/firestore';
import {useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {TimeSinceActionTooltip} from '../../../../components/TimeSinceActionTooltip/TimeSinceActionTooltip.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DataSource} from '../../data-source.js';
import {useDataSourceAction} from '../../useDataSourceAction.js';

export interface DataSourceStatusButtonProps {
  dataSource: DataSource;
  action: 'sync' | 'publish';
  onAction?: () => void;
}

export function DataSourceStatusButton(props: DataSourceStatusButtonProps) {
  const dataSource = props.dataSource;
  const [timestamp, setTimestamp] = useState(
    props.action === 'sync' ? dataSource.syncedAt : dataSource.publishedAt
  );
  const [email, setEmail] = useState(
    props.action === 'sync' ? dataSource.syncedBy : dataSource.publishedBy
  );
  const {loading, run} = useDataSourceAction(dataSource, props.action, () => {
    setTimestamp(Timestamp.now());
    setEmail(window.firebase.user.email!);
    props.onAction?.();
  });

  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);
  const isPublishAction = props.action === 'publish';
  const isArchived = Boolean(dataSource.archivedAt);

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
              onClick={() => run()}
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
