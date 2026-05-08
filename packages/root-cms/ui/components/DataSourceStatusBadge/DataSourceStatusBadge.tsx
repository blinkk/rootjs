import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {DataSource} from '../../utils/data-source.js';
import {getTimeAgo} from '../../utils/time.js';

const TOOLTIP_PROPS = {
  transition: 'pop',
};

export interface DataSourceStatusBadgeProps {
  dataSource: DataSource;
}

export function DataSourceStatusBadge(props: DataSourceStatusBadgeProps) {
  const dataSource = props.dataSource;
  if (testIsValidTimestamp(dataSource.archivedAt)) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Archived ${timeDiff(dataSource.archivedAt)} by ${
          dataSource.archivedBy
        }`}
      >
        <Badge size="xs" color="gray" variant="filled">
          Archived
        </Badge>
      </Tooltip>
    );
  }
  if (testIsValidTimestamp(dataSource.publishedAt)) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Published ${timeDiff(dataSource.publishedAt)} by ${
          dataSource.publishedBy
        }`}
      >
        <Badge
          size="xs"
          variant="gradient"
          gradient={{from: 'teal', to: 'lime', deg: 105}}
        >
          Published
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Badge size="xs" variant="gradient" gradient={{from: 'indigo', to: 'cyan'}}>
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
