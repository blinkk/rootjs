import './DocStatusBadges.css';

import {Badge, Popover, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {CMSDoc, testPublishingLocked} from '../../utils/doc.js';
import {Release} from '../../utils/release.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';
import {useCompareDraftModal} from '../CompareDraftModal/CompareDraftModal.js';
import {UserActionTooltip} from '../UserActionTooltip/UserActionTooltip.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {useVersionHistoryModal} from '../VersionHistoryModal/VersionHistoryModal.js';

type StatusTone =
  | 'draft'
  | 'published'
  | 'scheduled'
  | 'locked'
  | 'archived'
  | 'release';

/**
 * Per-tone Mantine gradient (matches the original badge colors exactly).
 */
const TONE_GRADIENTS: Record<
  StatusTone,
  {from: string; to: string; deg?: number}
> = {
  draft: {from: 'indigo', to: 'cyan'},
  published: {from: 'teal', to: 'lime', deg: 105},
  scheduled: {from: 'grape', to: 'pink', deg: 35},
  locked: {from: 'orange', to: 'red'},
  archived: {from: 'gray', to: 'dark'},
  release: {from: 'violet', to: 'grape'},
};

/**
 * Renders a compact status pill using the original Mantine gradient colors,
 * with the updated font styling/sizing applied via CSS.
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
      variant="gradient"
      gradient={TONE_GRADIENTS[tone]}
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
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const doc = props.doc;
  const sys = doc.sys;
  const versionHistoryModal = useVersionHistoryModal({
    docId: props.docId || doc.id,
  });
  const compareDraftModal = useCompareDraftModal({
    docId: props.docId || doc.id,
  });
  // Shared by the Draft and Published badges: both open the version history.
  const onShowVersionHistory = versionHistoryModal.enabled
    ? () => versionHistoryModal.open()
    : undefined;
  // When a doc is both published and has newer unpublished edits, clicking the
  // Draft badge shows the diff between published and draft.
  const hasUnpublishedChanges =
    !!sys.publishedAt && !!sys.modifiedAt && sys.modifiedAt > sys.publishedAt;
  const onDraftClick =
    hasUnpublishedChanges && compareDraftModal.enabled
      ? () => compareDraftModal.open()
      : onShowVersionHistory;
  return (
    <div className="DocStatusBadges">
      {(!sys.publishedAt ||
        !sys.modifiedAt ||
        sys.modifiedAt > sys.publishedAt) && (
        <UserActionTooltip
          position={props.tooltipPosition}
          heading={hasUnpublishedChanges ? 'Unpublished changes' : undefined}
          message={`Modified ${timeDiff(sys.modifiedAt)}`}
          user={sys.modifiedBy}
        >
          <StatusBadge
            tone="draft"
            className={
              onDraftClick ? 'DocStatusBadges__badge--clickable' : undefined
            }
            style={onDraftClick ? {cursor: 'pointer'} : undefined}
            role={onDraftClick ? 'button' : undefined}
            tabIndex={onDraftClick ? 0 : undefined}
            onClick={
              onDraftClick
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDraftClick();
                  }
                : undefined
            }
            onKeyDown={
              onDraftClick
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDraftClick();
                    }
                  }
                : undefined
            }
          >
            Draft
          </StatusBadge>
        </UserActionTooltip>
      )}
      {!!sys.publishedAt && (
        <UserActionTooltip
          position={props.tooltipPosition}
          message={`Published ${timeDiff(sys.publishedAt ?? null)}`}
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
            Locked
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
  // When a doc belongs to multiple releases, collapse them into a single badge
  // that opens a clickable list of releases.
  if (releases.length > 1) {
    return <MultiReleaseBadge releases={releases} />;
  }
  const release = releases[0];
  return (
    <Tooltip {...props.tooltipProps} label={`In release: ${release.id}`}>
      <Badge
        component="a"
        href={`/cms/releases/${release.id}`}
        size="sm"
        variant="gradient"
        gradient={TONE_GRADIENTS.release}
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
  );
}

/**
 * A single badge representing membership in multiple releases. Clicking it
 * opens an interactive popover listing each release; the popover stays open so
 * the user can click through to a specific release.
 */
function MultiReleaseBadge(props: {releases: Release[]}) {
  const [opened, setOpened] = useState(false);
  const releases = props.releases;
  return (
    <Popover
      opened={opened}
      onClose={() => setOpened(false)}
      withArrow
      withCloseButton={false}
      position="bottom"
      placement="center"
      spacing={4}
      width={220}
      target={
        <Badge
          size="sm"
          variant="gradient"
          gradient={TONE_GRADIENTS.release}
          classNames={{
            root: 'DocStatusBadges__badge DocStatusBadges__badge--release DocStatusBadges__releaseBadge DocStatusBadges__badge--clickable',
            inner:
              'DocStatusBadges__badge__inner DocStatusBadges__releaseBadge__inner',
          }}
          style={{cursor: 'pointer'}}
          role="button"
          tabIndex={0}
          aria-label={`${releases.length} releases`}
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setOpened((value) => !value);
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpened((value) => !value);
            }
          }}
        >
          {releases.length} releases
        </Badge>
      }
    >
      <div className="DocStatusBadges__releaseList">
        <div className="DocStatusBadges__releaseList__title">In releases</div>
        {releases.map((release) => (
          <a
            key={release.id}
            className="DocStatusBadges__releaseList__item"
            href={`/cms/releases/${release.id}`}
          >
            {release.id}
          </a>
        ))}
      </div>
    </Popover>
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
