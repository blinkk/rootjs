import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {Release} from '../../utils/release.js';
import {getTimeAgo} from '../../utils/time.js';

const TOOLTIP_PROPS = {
  transition: 'pop',
};

export interface ReleaseStatusBadgeProps {
  release: Release;
}

export function ReleaseStatusBadge(props: ReleaseStatusBadgeProps) {
  const release = props.release;
  if (release.archivedAt) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Archived ${timeDiff(release.archivedAt)} by ${release.archivedBy}`}
      >
        <Badge size="xs" color="gray" variant="filled">
          Archived
        </Badge>
      </Tooltip>
    );
  }
  if (release.scheduledAt) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Scheduled ${formatDateTime(release.scheduledAt)} by ${
          release.scheduledBy
        }`}
        wrapLines
        width={240}
      >
        <Badge
          size="xs"
          variant="gradient"
          gradient={{from: 'grape', to: 'pink', deg: 35}}
        >
          Scheduled
        </Badge>
      </Tooltip>
    );
  }
  if (release.publishedAt) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Published ${timeDiff(release.publishedAt)} by ${
          release.publishedBy
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

function timeDiff(ts: Timestamp | null) {
  // Since we're using server timestamps, firestore doesn't always return the
  // timestamp right away since the db save is happening asynchronously. In
  // these cases, assume that the update happened very recently.
  if (!ts) {
    return getTimeAgo(new Date().getTime());
  }
  return getTimeAgo(ts.toMillis());
}

function formatDateTime(ts: Timestamp) {
  const date = new Date(ts.toMillis());
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
