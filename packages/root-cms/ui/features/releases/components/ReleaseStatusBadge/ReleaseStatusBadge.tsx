import {Timestamp} from 'firebase/firestore';
import {ComponentChildren} from 'preact';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {StatusBadge} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {Release} from '../../release.js';

export interface ReleaseStatusBadgeProps {
  release: Release;
}

export function ReleaseStatusBadge(props: ReleaseStatusBadgeProps) {
  const release = props.release;
  if (testIsValidTimestamp(release.archivedAt)) {
    return (
      <StatusTooltip
        label={`Archived ${timeDiff(release.archivedAt)} by ${
          release.archivedBy
        }`}
      >
        <StatusBadge tone="archived">Archived</StatusBadge>
      </StatusTooltip>
    );
  }
  if (testIsValidTimestamp(release.scheduledAt)) {
    return (
      <StatusTooltip
        label={`Scheduled ${formatDateTime(release.scheduledAt)} by ${
          release.scheduledBy
        }`}
      >
        <StatusBadge tone="scheduled">Scheduled</StatusBadge>
      </StatusTooltip>
    );
  }
  if (testIsValidTimestamp(release.publishedAt)) {
    return (
      <StatusTooltip
        label={`Published ${timeDiff(release.publishedAt)} by ${
          release.publishedBy
        }`}
      >
        <StatusBadge tone="published">Published</StatusBadge>
      </StatusTooltip>
    );
  }
  if (testIsValidTimestamp(release.rolledBackAt)) {
    return (
      <StatusTooltip
        label={`Rolled back ${timeDiff(release.rolledBackAt)} by ${
          release.rolledBackBy
        }`}
      >
        <StatusBadge tone="draft">Rolled back</StatusBadge>
      </StatusTooltip>
    );
  }
  return (
    <span className="ReleaseStatusBadge inline-flex">
      <StatusBadge tone="draft">Unpublished</StatusBadge>
    </span>
  );
}

/** A tooltip on a status badge, which also gets the block class. */
function StatusTooltip(props: {label: string; children: ComponentChildren}) {
  return (
    <Tooltip
      label={props.label}
      className="ReleaseStatusBadge"
      contentClassName="max-w-60"
    >
      {props.children}
    </Tooltip>
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
