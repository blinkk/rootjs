import {ComponentChildren} from 'preact';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {
  formatDateTime,
  formatTimeAgo,
  timestampToMillis,
} from '../../../../utils/time.js';
import {StatusBadge} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {Release} from '../../release.js';

export interface ReleaseStatusBadgeProps {
  release: Release;
}

export function ReleaseStatusBadge(props: ReleaseStatusBadgeProps) {
  const release = props.release;
  if (timestampToMillis(release.archivedAt) > 0) {
    return (
      <StatusTooltip
        label={`Archived ${formatTimeAgo(release.archivedAt)} by ${
          release.archivedBy
        }`}
      >
        <StatusBadge tone="archived">Archived</StatusBadge>
      </StatusTooltip>
    );
  }
  if (timestampToMillis(release.scheduledAt) > 0) {
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
  if (timestampToMillis(release.publishedAt) > 0) {
    return (
      <StatusTooltip
        label={`Published ${formatTimeAgo(release.publishedAt)} by ${
          release.publishedBy
        }`}
      >
        <StatusBadge tone="published">Published</StatusBadge>
      </StatusTooltip>
    );
  }
  if (timestampToMillis(release.rolledBackAt) > 0) {
    return (
      <StatusTooltip
        label={`Rolled back ${formatTimeAgo(release.rolledBackAt)} by ${
          release.rolledBackBy
        }`}
      >
        <StatusBadge tone="rolledBack">Rolled back</StatusBadge>
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
      classNames={{tooltip: 'max-w-60'}}
    >
      {props.children}
    </Tooltip>
  );
}
