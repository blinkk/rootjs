import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {formatTimeAgo, timestampToMillis} from '../../../../utils/time.js';
import {DataSource} from '../../data-source.js';

export interface DataSourceStatusBadgeProps {
  dataSource: DataSource;
}

export function DataSourceStatusBadge(props: DataSourceStatusBadgeProps) {
  const dataSource = props.dataSource;
  if (timestampToMillis(dataSource.archivedAt) > 0) {
    return (
      <Tooltip
        label={`Archived ${formatTimeAgo(dataSource.archivedAt)} by ${
          dataSource.archivedBy
        }`}
      >
        <Badge size="xs" variant="gradient" gradient="gray">
          Archived
        </Badge>
      </Tooltip>
    );
  }
  if (timestampToMillis(dataSource.publishedAt) > 0) {
    return (
      <Tooltip
        label={`Published ${formatTimeAgo(dataSource.publishedAt)} by ${
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
