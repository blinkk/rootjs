import './DocStatusBadges.css';

import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {CMSDoc, testPublishingLocked} from '../../utils/doc.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';

interface DocStatusBadgesProps {
  doc: CMSDoc;
  /** Doc ID used for release lookup. Falls back to doc.id if not provided. */
  docId?: string;
  tooltipPosition?: 'bottom' | 'top';
  hideReleases?: boolean;
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const doc = props.doc;
  const sys = doc.sys;
  return (
    <div className="DocStatusBadges">
      {(!sys.publishedAt ||
        !sys.modifiedAt ||
        sys.modifiedAt > sys.publishedAt) && (
        <Tooltip
          {...tooltipProps}
          label={`Modified ${timeDiff(sys.modifiedAt)} by ${sys.modifiedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'indigo', to: 'cyan'}}
          >
            Draft
          </Badge>
        </Tooltip>
      )}
      {!!sys.publishedAt && (
        <Tooltip
          {...tooltipProps}
          label={`Published ${timeDiff(sys.publishedAt)} by ${sys.publishedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'teal', to: 'lime', deg: 105}}
          >
            Published
          </Badge>
        </Tooltip>
      )}
      {!!sys.scheduledAt && (
        <Tooltip
          {...tooltipProps}
          label={`Scheduled ${formatDateTime(sys.scheduledAt)} by ${
            sys.scheduledBy
          }`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'grape', to: 'pink', deg: 35}}
          >
            Scheduled
          </Badge>
        </Tooltip>
      )}
      {!props.hideReleases && (
        <ReleaseBadges
          docId={props.docId || doc.id}
          tooltipProps={tooltipProps}
        />
      )}
      {testPublishingLocked(doc) && (
        <Tooltip {...tooltipProps} label={getPublishingLockedLabel(doc)}>
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'orange', to: 'red'}}
          >
            Locked
          </Badge>
        </Tooltip>
      )}
      {!!sys.archivedAt && (
        <Tooltip
          {...tooltipProps}
          label={`Archived ${timeDiff(sys.archivedAt)} by ${sys.archivedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'gray', to: 'dark'}}
          >
            Archived
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Returns a human-readable label for the publishing lock tooltip.
 */
export function getPublishingLockedLabel(docData: CMSDoc): string {
  const lock = docData.sys?.publishingLocked;
  if (!lock) {
    return '';
  }
  if (lock.until) {
    const formatted = formatDateTime(lock.until);
    return `Locked until ${formatted} by ${lock.lockedBy}: "${lock.reason}"`;
  }
  return `Locked by ${lock.lockedBy}: "${lock.reason}"`;
}

function ReleaseBadges(props: {
  docId: string;
  tooltipProps: Record<string, any>;
}) {
  const {getReleasesForDoc} = usePendingReleases();
  const releases = getReleasesForDoc(props.docId);
  if (releases.length === 0) {
    return null;
  }
  return (
    <>
      {releases.map((release) => (
        <Tooltip
          key={release.id}
          {...props.tooltipProps}
          label={`In release: ${release.id}`}
        >
          <Badge
            component="a"
            href={`/cms/releases/${release.id}`}
            size="xs"
            variant="gradient"
            gradient={{from: 'violet', to: 'grape'}}
            style={{cursor: 'pointer'}}
          >
            {release.id}
          </Badge>
        </Tooltip>
      ))}
    </>
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
