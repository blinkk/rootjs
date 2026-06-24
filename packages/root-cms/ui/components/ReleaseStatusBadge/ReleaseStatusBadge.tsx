import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {Release} from '../../utils/release.js';
import {getTimeAgo} from '../../utils/time.js';
import '../DocStatusBadges/DocStatusBadges.css';

const TOOLTIP_PROPS = {
  transition: 'pop',
};

function badgeClassNames(tone: string) {
  return {
    root: `DocStatusBadges__badge DocStatusBadges__badge--${tone}`,
    inner: 'DocStatusBadges__badge__inner',
  };
}

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
        <Badge
          size="sm"
          radius="sm"
          variant="filled"
          classNames={badgeClassNames('archived')}
        >
          Archived
        </Badge>
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
        <Badge
          size="sm"
          radius="sm"
          variant="filled"
          classNames={badgeClassNames('scheduled')}
        >
          Scheduled
        </Badge>
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
        <Badge
          size="sm"
          radius="sm"
          variant="filled"
          classNames={badgeClassNames('published')}
        >
          Published
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Badge
      size="sm"
      radius="sm"
      variant="filled"
      classNames={badgeClassNames('draft')}
    >
      Unpublished
    </Badge>
  );
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
