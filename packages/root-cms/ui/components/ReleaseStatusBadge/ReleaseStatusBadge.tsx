import {Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {Release} from '../../utils/release.js';
import {getTimeAgo} from '../../utils/time.js';
import {StatusBadge} from '../DocStatusBadges/DocStatusBadges.js';
import '../DocStatusBadges/DocStatusBadges.css';

const TOOLTIP_PROPS = {
  transition: 'pop',
};

export interface ReleaseStatusBadgeProps {
  release: Release;
}

export function ReleaseStatusBadge(props: ReleaseStatusBadgeProps) {
  const release = props.release;
  if (testIsValidTimestamp(release.archivedAt)) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Archived ${timeDiff(release.archivedAt)} by ${
          release.archivedBy
        }`}
      >
        <StatusBadge tone="archived">Archived</StatusBadge>
      </Tooltip>
    );
  }
  if (testIsValidTimestamp(release.scheduledAt)) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Scheduled ${formatDateTime(release.scheduledAt)} by ${
          release.scheduledBy
        }`}
        wrapLines
        width={240}
      >
        <StatusBadge tone="scheduled">Scheduled</StatusBadge>
      </Tooltip>
    );
  }
  if (testIsValidTimestamp(release.publishedAt)) {
    return (
      <Tooltip
        {...TOOLTIP_PROPS}
        label={`Published ${timeDiff(release.publishedAt)} by ${
          release.publishedBy
        }`}
      >
        <StatusBadge tone="published">Published</StatusBadge>
      </Tooltip>
    );
  }
  return <StatusBadge tone="draft">Unpublished</StatusBadge>;
}

function testIsValidTimestamp(ts: any): ts is Timestamp {
  return Boolean(ts && ts.toMillis);
}

function timeDiff(ts: Timestamp | null) {
  // Since we're using server timestamps, firestore doesn't always return the
  // timestamp right away since the db save is happening asynchronously. In
  // these cases, assume that the update happened very recently.
  if (!ts?.toMillis) {
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
