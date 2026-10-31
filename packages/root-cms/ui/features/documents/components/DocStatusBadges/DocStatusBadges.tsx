import {Timestamp} from 'firebase/firestore';
import {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {useState} from 'preact/hooks';
import {Badge, type BadgeGradient} from '../../../../primitives/Badge/Badge.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {formatDateTime, getTimeAgo} from '../../../../utils/time.js';
import {Release} from '../../../releases/release.js';
import {usePendingReleases} from '../../../releases/usePendingReleases.js';
import {UserActionTooltip} from '../../../users/UserActionTooltip/UserActionTooltip.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {CMSDoc, testPublishingLocked} from '../../doc.js';
import {useCompareDraftModal} from '../CompareDraftModal/useCompareDraftModal.js';
import {useVersionHistoryModal} from '../VersionHistoryModal/useVersionHistoryModal.js';

export type StatusTone =
  | 'draft'
  | 'published'
  | 'scheduled'
  | 'locked'
  | 'archived'
  | 'release'
  | 'rolledBack';

/**
 * The `Badge` gradient for each tone (the `--cms-gradient-*` theme tokens,
 * which match the original Mantine badge colors).
 */
export const TONE_GRADIENTS: Record<StatusTone, BadgeGradient> = {
  draft: 'blue',
  published: 'green',
  scheduled: 'pink',
  locked: 'orange',
  archived: 'gray',
  release: 'violet',
  rolledBack: 'yellow',
};

/** Hover and focus styles for badges that open something when clicked. */
const CLICKABLE_CLASSES =
  'DocStatusBadges__badge--clickable cursor-pointer transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export interface StatusBadgeProps {
  tone: StatusTone;
  children: ComponentChildren;
  /** Icon before the label. */
  leftSection?: ComponentChildren;
  className?: string;
  style?: JSX.CSSProperties;
  /** Ignored: the badge renders a link when `href` is set. */
  component?: unknown;
  href?: string;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  onClick?: (e: any) => void;
  onKeyDown?: (e: any) => void;
}

/**
 * A compact gradient status pill (e.g. "Draft", "Published"). It shrinks
 * and truncates its label when the column is squeezed.
 */
export const StatusBadge = forwardRef<
  HTMLSpanElement | HTMLAnchorElement,
  StatusBadgeProps
>((props, ref) => {
  const {tone, children, className, leftSection, component, ...rest} = props;
  void component;
  return (
    <Badge
      {...(rest as any)}
      ref={ref}
      size="xs"
      variant="gradient"
      gradient={TONE_GRADIENTS[tone]}
      icon={leftSection}
      className={cn(
        'DocStatusBadges__badge',
        `DocStatusBadges__badge--${tone}`,
        'min-w-0 shrink',
        className
      )}
    >
      {children}
    </Badge>
  );
}) as unknown as FunctionComponent<
  StatusBadgeProps & {ref?: Ref<HTMLSpanElement | HTMLAnchorElement>}
>;

/**
 * Props that make a badge act as a button which calls `onActivate` on click,
 * Enter or Space, without triggering a row link it sits inside.
 */
function clickableProps(onActivate?: () => void) {
  if (!onActivate) {
    return {};
  }
  return {
    className: CLICKABLE_CLASSES,
    role: 'button',
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

interface DocStatusBadgesProps {
  doc: CMSDoc;
  /** Doc ID used for release lookup. Falls back to doc.id if not provided. */
  docId?: string;
  hideReleases?: boolean;
  /**
   * Optional click handler for the "Locked" publishing-lock badge. When set,
   * the badge becomes interactive (clickable) so callers can open an edit UI.
   */
  onPublishingLockClick?: () => void;
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
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
    <div className="DocStatusBadges flex min-w-0 items-center gap-1">
      {(!sys.publishedAt ||
        !sys.modifiedAt ||
        sys.modifiedAt > sys.publishedAt) && (
        <UserActionTooltip
          heading={hasUnpublishedChanges ? 'Unpublished changes' : undefined}
          message={`Modified ${timeDiff(sys.modifiedAt)}`}
          user={sys.modifiedBy}
        >
          <StatusBadge tone="draft" {...clickableProps(onDraftClick)}>
            Draft
          </StatusBadge>
        </UserActionTooltip>
      )}
      {!!sys.publishedAt && (
        <UserActionTooltip
          message={`Published ${timeDiff(sys.publishedAt ?? null)}`}
          user={sys.publishedBy}
        >
          <StatusBadge
            tone="published"
            {...clickableProps(onShowVersionHistory)}
          >
            Published
          </StatusBadge>
        </UserActionTooltip>
      )}
      {!!sys.scheduledAt && (
        <UserActionTooltip
          message={`Scheduled ${formatDateTime(sys.scheduledAt)}`}
          user={sys.scheduledBy}
        >
          <StatusBadge tone="scheduled">Scheduled</StatusBadge>
        </UserActionTooltip>
      )}
      {!props.hideReleases && <ReleaseBadges docId={props.docId || doc.id} />}
      {testPublishingLocked(doc) && (
        <Tooltip label={<PublishingLockTooltip doc={doc} />}>
          <StatusBadge
            tone="locked"
            aria-label="Locked"
            {...clickableProps(props.onPublishingLockClick)}
          >
            Locked
          </StatusBadge>
        </Tooltip>
      )}
      {!!sys.archivedAt && (
        <UserActionTooltip
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
    <div className="DocStatusBadges__lockTooltip flex flex-col gap-0.5 text-left">
      <div className="DocStatusBadges__lockTooltip__top flex items-center gap-2">
        {lock.lockedBy && (
          <UserAvatar
            className="shrink-0 border border-inverse/35"
            email={lock.lockedBy}
            size={20}
            withTooltip={false}
          />
        )}
        <div className="DocStatusBadges__lockTooltip__topText flex min-w-0 flex-col gap-0.5">
          <div className="DocStatusBadges__lockTooltip__line leading-snug">
            Locked by {lock.lockedBy}
          </div>
          {lock.until && (
            <div className="DocStatusBadges__lockTooltip__line leading-snug">
              Until {formatDateTime(lock.until)}
            </div>
          )}
        </div>
      </div>
      {lock.reason && (
        <>
          <div className="DocStatusBadges__lockTooltip__divider my-1 h-px bg-inverse opacity-30" />
          <div className="DocStatusBadges__lockTooltip__line leading-snug">
            Reason:
          </div>
          <div className="DocStatusBadges__lockTooltip__reason whitespace-pre-line leading-snug">
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

/** Classes for the badge(s) showing which releases a doc is in. */
const RELEASE_BADGE_CLASSES =
  'DocStatusBadges__releaseBadge cursor-pointer font-mono tracking-normal';

function ReleaseBadges(props: {docId: string}) {
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
    <Tooltip label={`In release: ${release.id}`}>
      <StatusBadge
        tone="release"
        href={`/cms/releases/${release.id}`}
        className={RELEASE_BADGE_CLASSES}
      >
        {release.id}
      </StatusBadge>
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
      withArrow
      open={opened}
      onOpenChange={setOpened}
      placement="bottom"
      width={220}
      label="In releases"
      className="DocStatusBadges__releaseList flex flex-col p-1"
      trigger={
        <StatusBadge
          tone="release"
          className={cn(RELEASE_BADGE_CLASSES, CLICKABLE_CLASSES)}
          role="button"
          tabIndex={0}
          aria-label={`${releases.length} releases`}
          onClick={(e: MouseEvent) => {
            // Keep the click from following a row link the badge sits in;
            // the popover toggles itself.
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpened((value) => !value);
            }
          }}
        >
          {releases.length} releases
        </StatusBadge>
      }
    >
      <div className="DocStatusBadges__releaseList__title px-2 pb-1 pt-0.5 text-xs font-semibold text-muted">
        In releases
      </div>
      {releases.map((release) => (
        <a
          key={release.id}
          className="DocStatusBadges__releaseList__item block truncate rounded-sm px-2 py-1 font-mono text-sm text-inherit no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          href={`/cms/releases/${release.id}`}
        >
          {release.id}
        </a>
      ))}
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
