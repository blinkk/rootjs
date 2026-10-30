import {Timestamp} from 'firebase/firestore';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {UserTag} from '../../../users/UserTag/UserTag.js';
import {NewerSyncDot} from '../NewerSyncDot/NewerSyncDot.js';

export interface DataSourceActivityProps {
  /** When the data source was synced or published. */
  at?: Timestamp;
  /** Email of the user who did it. */
  by?: string;
  /** Marks a sync that's newer than the last publish. */
  newer?: boolean;
  className?: string;
}

/**
 * When a data source was last synced or published and by whom, e.g. "2 days
 * ago · <avatar> Jane", or "Never".
 */
export function DataSourceActivity(props: DataSourceActivityProps) {
  const millis = props.at?.toMillis?.();
  if (!millis) {
    return (
      <span className={cn('DataSourceActivity text-muted', props.className)}>
        Never
      </span>
    );
  }
  const fullDate = new Date(millis).toLocaleString();
  return (
    <span
      className={cn(
        'DataSourceActivity inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap',
        props.className
      )}
    >
      {props.newer && <NewerSyncDot />}
      <Tooltip
        label={props.newer ? `${fullDate}, after the last publish` : fullDate}
      >
        <span
          className={cn(
            'DataSourceActivity__time cursor-default',
            props.newer && 'font-medium text-warning'
          )}
        >
          {getTimeAgo(millis)}
        </span>
      </Tooltip>
      {props.by && (
        <>
          <span className="DataSourceActivity__sep text-muted">·</span>
          <UserAvatar
            className="DataSourceActivity__avatar shrink-0"
            email={props.by}
            size={16}
            withTooltip={false}
          />
          <UserTag
            className="DataSourceActivity__user truncate"
            email={props.by}
          />
        </>
      )}
    </span>
  );
}
