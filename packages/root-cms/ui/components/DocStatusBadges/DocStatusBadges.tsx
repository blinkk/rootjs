import './DocStatusBadges.css';

import {Badge, Tooltip} from '@mantine/core';
import {IconShield} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {ComponentChildren} from 'preact';
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {CMSDoc, testPublishingLocked} from '../../utils/doc.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';
import {useCompareDraftModal} from '../CompareDraftModal/CompareDraftModal.js';
import {UserActionTooltip} from '../UserActionTooltip/UserActionTooltip.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {useVersionHistoryModal} from '../VersionHistoryModal/VersionHistoryModal.js';

type StatusTone =
  | 'draft'
  | 'changed'
  | 'published'
  | 'scheduled'
  | 'locked'
  | 'archived'
  | 'release';

/**
 * Renders a compact status pill with a hand-tuned, high-contrast color tone.
 * Colors are defined in CSS (not Mantine's pale `light` variant) so the
 * background/text pairing meets WCAG AA contrast.
 */
function StatusBadge(props: {
  tone: StatusTone;
  children: ComponentChildren;
  leftSection?: ComponentChildren;
  className?: string;
  style?: Record<string, any>;
  component?: any;
  href?: string;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  onClick?: (e: any) => void;
  onKeyDown?: (e: any) => void;
}) {
  const {tone, children, className, leftSection, ...rest} = props;
  return (
    <Badge
      size="sm"
      radius="sm"
      variant="filled"
      leftSection={leftSection}
      classNames={{
        root: joinClassNames(
          'DocStatusBadges__badge',
          `DocStatusBadges__badge--${tone}`,
          className
        ),
        inner: 'DocStatusBadges__badge__inner',
        leftSection: 'DocStatusBadges__badge__leftSection',
      }}
      {...rest}
    >
      {children}
    </Badge>
  );
}

function joinClassNames(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(' ');
}

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
  /**
   * When true, the "Locked" badge shows the "Locked" text label next to the
   * shield icon. Defaults to false (icon-only), which is used in dense list
   * views; the doc editor opts in to the labeled variant.
   */
  showLockedLabel?: boolean;
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const doc = props.doc;
  const sys = doc.sys;
  const publishState = getPublishState(sys);
  const compareDraftModal = useCompareDraftModal({
    docId: props.docId || doc.id,
  });
  const onChangedClick = compareDraftModal.enabled
    ? () => compareDraftModal.open()
    : undefined;
  const versionHistoryModal = useVersionHistoryModal({
    docId: props.docId || doc.id,
  });
  // Shared by the Draft and Published badges: both open the version history.
  const onShowVersionHistory = versionHistoryModal.enabled
    ? () => versionHistoryModal.open()
    : undefined;
  return (
    <div className="DocStatusBadges">
      {/*
        Single publish-state badge (Draft / Published / Changed), following the
        Sanity/Hygraph/Contentful convention of collapsing "published doc with
        newer unpublished edits" into one "Changed" badge rather than stacking
        separate Draft + Published badges.
      */}
      {publishState === 'draft' && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Modified ${timeDiff(sys.modifiedAt)}`}
          user={sys.modifiedBy}
        >
          <StatusBadge
            tone="draft"
            className={
              onShowVersionHistory
                ? 'DocStatusBadges__badge--clickable'
                : undefined
            }
            style={onShowVersionHistory ? {cursor: 'pointer'} : undefined}
            role={onShowVersionHistory ? 'button' : undefined}
            tabIndex={onShowVersionHistory ? 0 : undefined}
            onClick={
              onShowVersionHistory
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowVersionHistory();
                  }
                : undefined
            }
            onKeyDown={
              onShowVersionHistory
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onShowVersionHistory();
                    }
                  }
                : undefined
            }
          >
            Draft
          </StatusBadge>
        </UserActionTooltip>
      )}
      {publishState === 'published' && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Published ${timeDiff(sys.publishedAt)}`}
          user={sys.publishedBy}
        >
          <StatusBadge
            tone="published"
            className={
              onShowVersionHistory
                ? 'DocStatusBadges__badge--clickable'
                : undefined
            }
            style={onShowVersionHistory ? {cursor: 'pointer'} : undefined}
            role={onShowVersionHistory ? 'button' : undefined}
            tabIndex={onShowVersionHistory ? 0 : undefined}
            onClick={
              onShowVersionHistory
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowVersionHistory();
                  }
                : undefined
            }
            onKeyDown={
              onShowVersionHistory
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onShowVersionHistory();
                    }
                  }
                : undefined
            }
          >
            Published
          </StatusBadge>
        </UserActionTooltip>
      )}
      {publishState === 'changed' && (
        <Tooltip
          position={props.tooltipPosition}
          transition="pop"
          withArrow
          label={
            <ChangedTooltip
              modifiedAt={sys.modifiedAt}
              modifiedBy={sys.modifiedBy}
              publishedAt={sys.publishedAt}
              publishedBy={sys.publishedBy}
            />
          }
        >
          <StatusBadge
            tone="changed"
            className={
              onChangedClick ? 'DocStatusBadges__badge--clickable' : undefined
            }
            style={onChangedClick ? {cursor: 'pointer'} : undefined}
            role={onChangedClick ? 'button' : undefined}
            tabIndex={onChangedClick ? 0 : undefined}
            onClick={
              onChangedClick
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChangedClick();
                  }
                : undefined
            }
            onKeyDown={
              onChangedClick
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onChangedClick();
                    }
                  }
                : undefined
            }
          >
            Changed
          </StatusBadge>
        </Tooltip>
      )}
      {!!sys.scheduledAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Scheduled ${formatDateTime(sys.scheduledAt)}`}
          user={sys.scheduledBy}
        >
          <StatusBadge tone="scheduled">Scheduled</StatusBadge>
        </UserActionTooltip>
      )}
      {!props.hideReleases && (
        <ReleaseBadges
          docId={props.docId || doc.id}
          tooltipProps={tooltipProps}
        />
      )}
      {testPublishingLocked(doc) && (
        <Tooltip
          position={props.tooltipPosition}
          transition="pop"
          withArrow
          width={260}
          wrapLines
          label={<PublishingLockTooltip doc={doc} />}
        >
          <StatusBadge
            tone="locked"
            leftSection={
              props.showLockedLabel ? (
                <IconShield size={12} stroke={2.25} />
              ) : undefined
            }
            className={joinClassNames(
              props.showLockedLabel
                ? undefined
                : 'DocStatusBadges__badge--iconOnly',
              props.onPublishingLockClick
                ? 'DocStatusBadges__badge--clickable'
                : undefined
            )}
            style={
              props.onPublishingLockClick ? {cursor: 'pointer'} : undefined
            }
            role={props.onPublishingLockClick ? 'button' : undefined}
            tabIndex={props.onPublishingLockClick ? 0 : undefined}
            aria-label="Locked"
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
            {props.showLockedLabel ? (
              'Locked'
            ) : (
              <IconShield size={13} stroke={2.25} />
            )}
          </StatusBadge>
        </Tooltip>
      )}
      {!!sys.archivedAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Archived ${timeDiff(sys.archivedAt)}`}
          user={sys.archivedBy}
        >
          <StatusBadge tone="archived">Archived</StatusBadge>
        </UserActionTooltip>
      )}
    </div>
  );
}

type PublishState = 'draft' | 'published' | 'changed';

/**
 * Computes the single publish-state for a doc, mirroring the convention used by
 * Sanity, Hygraph, and Contentful:
 *   - `draft`: never published.
 *   - `changed`: published, but has newer unpublished edits.
 *   - `published`: published and up to date.
 */
function getPublishState(sys: CMSDoc['sys']): PublishState {
  if (!sys.publishedAt) {
    return 'draft';
  }
  if (!sys.modifiedAt) {
    return 'published';
  }
  return sys.modifiedAt > sys.publishedAt ? 'changed' : 'published';
}

/**
 * Structured tooltip content for the "Changed" badge. Renders:
 *   Unpublished changes
 *   ---
 *   [avatar]  Modified <date>
 *             by <email>
 *   ---
 *   [avatar]  Published <date>
 *             by <email>
 */
function ChangedTooltip(props: {
  modifiedAt: Timestamp | null;
  modifiedBy?: string | null;
  publishedAt?: Timestamp | null;
  publishedBy?: string | null;
}) {
  return (
    <div className="DocStatusBadges__changedTooltip">
      <div className="DocStatusBadges__changedTooltip__title">
        Unpublished changes
      </div>
      <div className="DocStatusBadges__lockTooltip__divider" />
      <TooltipUserRow
        action="Modified"
        date={props.modifiedAt}
        user={props.modifiedBy}
      />
      {props.publishedAt && (
        <>
          <div className="DocStatusBadges__lockTooltip__divider" />
          <TooltipUserRow
            action="Published"
            date={props.publishedAt}
            user={props.publishedBy}
          />
        </>
      )}
    </div>
  );
}

/**
 * A tooltip row showing "<action> <date>" / "by <email>" with the user's
 * avatar on the left.
 */
function TooltipUserRow(props: {
  action: string;
  date: Timestamp | null | undefined;
  user?: string | null;
}) {
  return (
    <div className="DocStatusBadges__tooltipRow">
      {props.user && (
        <UserAvatar email={props.user} size={20} withTooltip={false} />
      )}
      <div className="DocStatusBadges__tooltipRow__text">
        <div className="DocStatusBadges__lockTooltip__line">
          {props.action} {props.date ? formatDateTime(props.date) : 'just now'}
        </div>
        {props.user && (
          <div className="DocStatusBadges__lockTooltip__line">
            by {props.user}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Structured tooltip content for the "Locked" publishing-lock badge. Renders:
 *   [avatar]  Locked by <name>
 *             Until <date>        (only when an expiry is set)
 *   ---
 *   Reason:                       (only when a reason is set)
 *   <reason>
 */
function PublishingLockTooltip(props: {doc: CMSDoc}) {
  const lock = props.doc.sys?.publishingLocked;
  if (!lock) {
    return null;
  }
  return (
    <div className="DocStatusBadges__lockTooltip">
      <div className="DocStatusBadges__lockTooltip__top">
        {lock.lockedBy && (
          <UserAvatar email={lock.lockedBy} size={20} withTooltip={false} />
        )}
        <div className="DocStatusBadges__lockTooltip__topText">
          <div className="DocStatusBadges__lockTooltip__line">
            Locked by {lock.lockedBy}
          </div>
          {lock.until && (
            <div className="DocStatusBadges__lockTooltip__line">
              Until {formatDateTime(lock.until)}
            </div>
          )}
        </div>
      </div>
      {lock.reason && (
        <>
          <div className="DocStatusBadges__lockTooltip__divider" />
          <div className="DocStatusBadges__lockTooltip__line">Reason:</div>
          <div className="DocStatusBadges__lockTooltip__reason">
            {lock.reason}
          </div>
        </>
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
            size="sm"
            radius="sm"
            variant="filled"
            classNames={{
              root: 'DocStatusBadges__badge DocStatusBadges__badge--release DocStatusBadges__releaseBadge',
              inner:
                'DocStatusBadges__badge__inner DocStatusBadges__releaseBadge__inner',
            }}
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
