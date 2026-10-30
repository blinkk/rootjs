import {Timestamp} from 'firebase/firestore';
import {RelativeTime} from '../../../../components/RelativeTime/RelativeTime.js';
import {cn} from '../../../../utils/classes.js';
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
  return (
    <span
      className={cn(
        // Raised above the listing card's stretched link, so the time and
        // user tooltips can be hovered.
        'DataSourceActivity relative z-1 inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap',
        props.className
      )}
    >
      {props.newer && <NewerSyncDot />}
      {/* Opens below to match the user tooltip. */}
      <RelativeTime
        placement="bottom"
        underline={false}
        className={cn(
          'DataSourceActivity__time',
          props.newer && 'font-medium text-warning'
        )}
        ts={props.at}
        tooltipSuffix={props.newer ? 'after the last publish' : undefined}
      />
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
