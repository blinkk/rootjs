import './DocStatusBadges.css';

import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {CMSDoc, testPublishingLocked} from '../../utils/doc.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';
import {UserActionTooltip} from '../UserActionTooltip/UserActionTooltip.js';

interface DocStatusBadgesProps {
  doc: CMSDoc;
  /** Doc ID used for release lookup. Falls back to doc.id if not provided. */
  docId?: string;
  tooltipPosition?: 'bottom' | 'top';
  hideReleases?: boolean;
  /**
   * Optional click handler for the "Locked" publishing-lock badge. When set,
   * the badge becomes interactive (clickable) so callers can open an edit UI.
   */
  onPublishingLockClick?: () => void;
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
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Modified ${timeDiff(sys.modifiedAt)}`}
          user={sys.modifiedBy}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'indigo', to: 'cyan'}}
          >
            Draft
          </Badge>
        </UserActionTooltip>
      )}
      {!!sys.publishedAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Published ${timeDiff(sys.publishedAt)}`}
          user={sys.publishedBy}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'teal', to: 'lime', deg: 105}}
          >
            Published
          </Badge>
        </UserActionTooltip>
      )}
      {!!sys.scheduledAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Scheduled ${formatDateTime(sys.scheduledAt)}`}
          user={sys.scheduledBy}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'grape', to: 'pink', deg: 35}}
          >
            Scheduled
          </Badge>
        </UserActionTooltip>
      )}
      {!props.hideReleases && (
        <ReleaseBadges
          docId={props.docId || doc.id}
          tooltipProps={tooltipProps}
        />
      )}
      {testPublishingLocked(doc) && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={getPublishingLockedMessage(doc)}
          detail={doc.sys?.publishingLocked?.reason}
          user={doc.sys?.publishingLocked?.lockedBy}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'orange', to: 'red'}}
            className={
              props.onPublishingLockClick
                ? 'DocStatusBadges__badge--clickable'
                : undefined
            }
            style={
              props.onPublishingLockClick ? {cursor: 'pointer'} : undefined
            }
            role={props.onPublishingLockClick ? 'button' : undefined}
            tabIndex={props.onPublishingLockClick ? 0 : undefined}
            onClick={props.onPublishingLockClick}
            onKeyDown={
              props.onPublishingLockClick
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      props.onPublishingLockClick!();
                    }
                  }
                : undefined
            }
          >
            Locked
          </Badge>
        </UserActionTooltip>
      )}
      {!!sys.archivedAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Archived ${timeDiff(sys.archivedAt)}`}
          user={sys.archivedBy}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'gray', to: 'dark'}}
          >
            Archived
          </Badge>
        </UserActionTooltip>
      )}
    </div>
  );
}

/**
 * Returns the primary message line for the publishing lock tooltip (without the
 * "by <user>" suffix and reason, which `UserActionTooltip` renders separately).
 */
function getPublishingLockedMessage(docData: CMSDoc): string {
  const lock = docData.sys?.publishingLocked;
  if (lock?.until) {
    return `Locked until ${formatDateTime(lock.until)}`;
  }
  return 'Locked';
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
