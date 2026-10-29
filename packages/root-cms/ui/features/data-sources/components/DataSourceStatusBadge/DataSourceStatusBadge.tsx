import {Timestamp} from 'firebase/firestore';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {DataSource} from '../../data-source.js';

export interface DataSourceStatusBadgeProps {
  dataSource: DataSource;
}

export function DataSourceStatusBadge(props: DataSourceStatusBadgeProps) {
  const dataSource = props.dataSource;
  if (testIsValidTimestamp(dataSource.archivedAt)) {
    return (
      <Tooltip
        label={`Archived ${timeDiff(dataSource.archivedAt)} by ${
          dataSource.archivedBy
        }`}
      >
        <Badge size="xs" variant="gradient" gradient="gray">
          Archived
        </Badge>
      </Tooltip>
    );
  }
  if (testIsValidTimestamp(dataSource.publishedAt)) {
    return (
      <Tooltip
        label={`Published ${timeDiff(dataSource.publishedAt)} by ${
          dataSource.publishedBy
        }`}
      >
        <Badge size="xs" variant="gradient" gradient="green">
          Published
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Badge size="xs" variant="gradient" gradient="blue">
      Unpublished
    </Badge>
  );
}

function testIsValidTimestamp(ts: any): ts is Timestamp {
  return Boolean(ts && ts.toMillis);
}

function timeDiff(ts: Timestamp | null | undefined) {
  // Since we're using server timestamps, firestore doesn't always return the
  // timestamp right away since the db save is happening asynchronously. In
  // these cases, assume that the update happened very recently.
  if (!ts?.toMillis) {
    return getTimeAgo(new Date().getTime());
  }
  return getTimeAgo(ts.toMillis());
}
