import {
  IconAlertTriangle,
  IconArchive,
  IconArchiveOff,
  IconCloudOff,
  IconDots,
  IconPackage,
  IconPlus,
  IconRocket,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import type {ComponentChildren, JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {Kbd} from '../../../../primitives/Kbd/Kbd.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {formatDateTime} from '../../../../utils/time.js';
import {
  CMSDoc,
  cmsArchiveDoc,
  cmsDeleteDoc,
  cmsPublishDocs,
  cmsUnarchiveDoc,
  cmsUnpublishDoc,
  testIsArchived,
  testIsScheduled,
  testPublishingLocked,
} from '../../../documents/doc.js';
import {useAddToRelease} from '../../../releases/components/AddToReleaseModal/AddToReleaseModal.js';
import {useAddToReleaseModal} from '../../../releases/components/AddToReleaseModal/useAddToReleaseModal.js';
import {usePublishChecks} from '../../../releases/usePublishChecks.js';
import {testCanEdit, testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';

/** How many docs a bulk action writes at once. */
const BULK_CONCURRENCY = 10;

/** How many failed docs a failure toast lists before "and N more". */
const MAX_LISTED_FAILURES = 3;

/** The word typed to confirm a bulk delete. */
const DELETE_CONFIRM_WORD = 'delete';

const NO_EDIT_ACCESS = "You don't have access to edit docs.";
const NO_PUBLISH_ACCESS = "You don't have access to publish docs.";

type BulkDialog = 'publish' | 'archive' | 'delete' | 'unpublish' | null;

export interface BulkActionBarProps {
  /** The selected docs, in list order. */
  docs: CMSDoc[];
  /** How many docs the list holds, for "Select all". */
  totalCount: number;
  /** Selects every doc in the list. */
  onSelectAll: () => void;
  /** Clears the selection. */
  onClear: () => void;
  /**
   * Called after a bulk action changes the docs, to clear the selection and
   * reload the list.
   */
  onDone: () => void;
}

/**
 * The toolbar that floats at the bottom of the docs list while docs are
 * selected, with actions that apply to every selected doc. An action is only
 * enabled when every selected doc supports it; otherwise its tooltip (or menu
 * note) says why. Menu actions that no selected doc supports are hidden.
 * Escape clears the selection.
 */
export function BulkActionBar(props: BulkActionBarProps) {
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  const canPublish = testCanPublish(roles, currentUserEmail);
  const publishChecks = usePublishChecks();
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dialog, setDialog] = useState<BulkDialog>(null);

  const docs = props.docs;
  const docIds = docs.map((doc) => doc.id);
  const count = docs.length;
  const allSelected = count === props.totalCount;

  const archived = docs.filter((doc) => testIsArchived(doc)).length;
  const scheduled = docs.filter((doc) => testIsScheduled(doc)).length;
  const locked = docs.filter((doc) => testPublishingLocked(doc)).length;
  const published = docs.filter((doc) => !!doc.sys?.publishedAt).length;

  const releaseBlocked = !canPublish
    ? NO_PUBLISH_ACCESS
    : archived
      ? docsAre(archived, 'archived')
      : '';
  const publishBlocked = !canPublish
    ? NO_PUBLISH_ACCESS
    : archived
      ? `${docsAre(archived, 'archived')} Archived docs can't be published.`
      : scheduled
        ? `${docsAre(scheduled, 'scheduled')} Unschedule ${them(scheduled)} first.`
        : locked
          ? docsAre(locked, 'locked for publishing')
          : '';
  const archiveBlocked = !canEdit
    ? NO_EDIT_ACCESS
    : archived
      ? docsAre(archived, 'already archived')
      : published
        ? `${docsAre(published, 'published')} Unpublish ${them(published)} before archiving.`
        : '';
  const unarchiveBlocked = !canEdit
    ? NO_EDIT_ACCESS
    : archived < count
      ? docsAre(count - archived, 'not archived')
      : '';
  const unpublishBlocked = !canPublish
    ? NO_PUBLISH_ACCESS
    : published < count
      ? `${docsAre(count - published, 'not published')}`
      : scheduled
        ? `${docsAre(scheduled, 'scheduled')} Unschedule ${them(scheduled)} first.`
        : '';
  const deleteBlocked = !canEdit ? NO_EDIT_ACCESS : '';

  // The More menu only lists an action when at least one selected doc is in a
  // state it applies to (e.g. Unarchive needs an archived doc). A listed action
  // is still disabled, with the reason, when it can't apply to all of them.
  const showArchive = archived < count;
  const showUnarchive = archived > 0;
  const showUnpublish = published > 0;

  // Escape clears the selection, unless it's closing something else first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) {
        return;
      }
      if (releaseOpen || moreOpen || dialog) {
        return;
      }
      if (document.querySelector('dialog[open]')) {
        return;
      }
      props.onClear();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [releaseOpen, moreOpen, dialog, props.onClear]);

  /**
   * Runs `action` on each selected doc, showing a loading toast that turns
   * into a success (or failure) toast.
   */
  async function runOnEachDoc(options: {
    action: (docId: string) => Promise<void>;
    /** E.g. "Archiving". */
    progressVerb: string;
    /** E.g. "Archived!". */
    successTitle: string;
    /** E.g. "archive", used in failure messages. */
    verb: string;
    /** E.g. "archived", used in the success message. */
    pastVerb: string;
  }) {
    const ids = docIds;
    const notificationId = `bulk-${options.verb}-${Date.now()}`;
    showNotification({
      id: notificationId,
      title: `${options.progressVerb} docs`,
      message: `${options.progressVerb} ${docsLabel(ids.length)}...`,
      loading: true,
      autoClose: false,
    });
    const failures = await runInChunks(ids, options.action);
    if (failures.length === 0) {
      updateNotification({
        id: notificationId,
        title: options.successTitle,
        message: `Successfully ${options.pastVerb} ${docsLabel(ids.length)}.`,
        color: 'green',
        loading: false,
        autoClose: 5000,
      });
    } else {
      updateNotification({
        id: notificationId,
        title: `Failed to ${options.verb} ${docsLabel(failures.length)}`,
        message: failureMessage(
          options.verb,
          ids.length - failures.length,
          options.pastVerb,
          failures
        ),
        color: 'red',
        loading: false,
        autoClose: false,
      });
    }
    props.onDone();
  }

  async function onPublish(publishMessage: string) {
    const ids = docIds;
    const decision = await publishChecks.run({
      docIds: ids,
      actionLabel: 'Publish',
    });
    if (!decision.proceed) {
      return;
    }
    const notificationId = `bulk-publish-${Date.now()}`;
    showNotification({
      id: notificationId,
      title: 'Publishing docs',
      message: `Publishing ${docsLabel(ids.length)}...`,
      loading: true,
      autoClose: false,
    });
    try {
      await cmsPublishDocs(ids, {
        publishMessage: publishMessage.trim() || undefined,
        checksAudit: decision.audit || undefined,
      });
    } catch (err) {
      console.error(err);
      updateNotification({
        id: notificationId,
        title: 'Publish failed',
        message: `Failed to publish ${docsLabel(ids.length)}: ${errorMessage(err)}`,
        color: 'red',
        loading: false,
        autoClose: false,
      });
      return;
    }
    updateNotification({
      id: notificationId,
      title: 'Published!',
      message: `Successfully published ${docsLabel(ids.length)}.`,
      color: 'green',
      loading: false,
      autoClose: 5000,
    });
    props.onDone();
    publishChecks.showWarnings(decision.results, {actionLabel: 'Publish'});
  }

  function onUnarchive() {
    runOnEachDoc({
      action: cmsUnarchiveDoc,
      progressVerb: 'Unarchiving',
      successTitle: 'Unarchived!',
      verb: 'unarchive',
      pastVerb: 'unarchived',
    });
  }

  function onConfirmDialog(publishMessage: string) {
    const current = dialog;
    setDialog(null);
    if (current === 'publish') {
      onPublish(publishMessage);
    } else if (current === 'archive') {
      runOnEachDoc({
        action: cmsArchiveDoc,
        progressVerb: 'Archiving',
        successTitle: 'Archived!',
        verb: 'archive',
        pastVerb: 'archived',
      });
    } else if (current === 'unpublish') {
      runOnEachDoc({
        action: cmsUnpublishDoc,
        progressVerb: 'Unpublishing',
        successTitle: 'Unpublished!',
        verb: 'unpublish',
        pastVerb: 'unpublished',
      });
    } else if (current === 'delete') {
      runOnEachDoc({
        action: cmsDeleteDoc,
        progressVerb: 'Deleting',
        successTitle: 'Deleted!',
        verb: 'delete',
        pastVerb: 'deleted',
      });
    }
  }

  return (
    <>
      <div className="BulkActionBar pointer-events-none sticky bottom-6 z-(--cms-z-sticky) mt-4 flex justify-center">
        <div
          className="BulkActionBar__toolbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-tooltip p-1.5 text-on-tooltip shadow-lg"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <Tooltip label="Clear selection">
            <BarButton
              className="BulkActionBar__clear"
              aria-label="Clear selection"
              iconOnly
              onClick={() => props.onClear()}
            >
              <IconX size={16} />
            </BarButton>
          </Tooltip>
          <div
            className="BulkActionBar__count whitespace-nowrap px-1 text-base font-semibold"
            aria-live="polite"
          >
            {allSelected && count > 1
              ? `All ${count} selected`
              : `${count} selected`}
          </div>
          {!allSelected && (
            <BarButton
              className="BulkActionBar__selectAll font-medium"
              onClick={() => props.onSelectAll()}
            >
              Select all {props.totalCount}
            </BarButton>
          )}
          <BarSeparator />
          <Popover
            className="BulkActionBar__releasePopover p-0"
            placement="top-start"
            width={360}
            label="Add to release"
            open={releaseOpen}
            onOpenChange={(open) => setReleaseOpen(open && !releaseBlocked)}
            trigger={
              <BarAction
                className="BulkActionBar__addToRelease"
                icon={<IconPackage size={16} />}
                label="Add to release"
                blocked={releaseBlocked}
                pressed={releaseOpen}
              />
            }
          >
            <ReleasePicker
              docs={docs}
              onDone={() => {
                setReleaseOpen(false);
                props.onDone();
              }}
              onNewRelease={() => setReleaseOpen(false)}
            />
          </Popover>
          <BarAction
            className="BulkActionBar__publish"
            icon={<IconRocket size={16} />}
            label="Publish"
            blocked={publishBlocked}
            onClick={() => setDialog('publish')}
          />
          <Menu
            className="BulkActionBar__moreMenu"
            placement="top-end"
            open={moreOpen}
            onOpenChange={(open) => setMoreOpen(open)}
            trigger={
              <BarButton
                className="BulkActionBar__more"
                aria-label="More actions"
                iconOnly
                pressed={moreOpen}
              >
                <IconDots size={18} />
              </BarButton>
            }
          >
            {showArchive && (
              <BlockedMenuItem
                icon={<IconArchive />}
                blocked={archiveBlocked}
                onClick={() => setDialog('archive')}
              >
                Archive
              </BlockedMenuItem>
            )}
            {showUnarchive && (
              <BlockedMenuItem
                icon={<IconArchiveOff />}
                blocked={unarchiveBlocked}
                onClick={() => onUnarchive()}
              >
                Unarchive
              </BlockedMenuItem>
            )}
            {showUnpublish && (
              <BlockedMenuItem
                icon={<IconCloudOff />}
                blocked={unpublishBlocked}
                onClick={() => setDialog('unpublish')}
              >
                Unpublish
              </BlockedMenuItem>
            )}
            {(showArchive || showUnarchive || showUnpublish) && <MenuDivider />}
            <BlockedMenuItem
              icon={<IconTrash />}
              blocked={deleteBlocked}
              danger
              onClick={() => setDialog('delete')}
            >
              Delete {docsLabel(count)}...
            </BlockedMenuItem>
          </Menu>
          <BarSeparator className="hidden md:block" />
          <div className="BulkActionBar__hint hidden items-center gap-1.5 whitespace-nowrap px-2 text-sm opacity-75 md:flex">
            <Kbd className="bg-on-tooltip/15 text-on-tooltip">Esc</Kbd>
            to clear
          </div>
        </div>
      </div>
      {/*
       * Outside the bar's wrapper, which ignores pointer events so the list
       * stays clickable around the toolbar.
       */}
      <BulkConfirmDialog
        type={dialog}
        docs={docs}
        onClose={() => setDialog(null)}
        onConfirm={onConfirmDialog}
      />
    </>
  );
}

/** A thin divider between groups of toolbar buttons. */
function BarSeparator(props: {className?: string}) {
  return (
    <div
      className={cn(
        'BulkActionBar__separator mx-1 h-5 w-px shrink-0 bg-on-tooltip/25',
        props.className
      )}
      aria-hidden="true"
    />
  );
}

type BarButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  /** Squares the button for an icon. */
  iconOnly?: boolean;
  /** Shows the button as pressed, e.g. while its popover is open. */
  pressed?: boolean;
  className?: string;
  children?: ComponentChildren;
};

/** A button styled for the dark toolbar. */
const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(
  (props, ref) => {
    const {iconOnly, pressed, className, children, ...rest} = props;
    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        className={cn(
          'BulkActionBar__button',
          'inline-flex h-control-md shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg text-base text-on-tooltip hover:bg-on-tooltip/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-(--cms-disabled-opacity) aria-disabled:hover:bg-transparent pointer-coarse:h-10',
          iconOnly ? 'w-control-md justify-center pointer-coarse:w-10' : 'px-3',
          pressed && 'bg-on-tooltip/15',
          className
        )}
      >
        {children}
      </button>
    );
  }
);

type BarActionProps = Omit<BarButtonProps, 'label'> & {
  icon: ComponentChildren;
  label: string;
  /** Why the action is unavailable, or empty when it's available. */
  blocked: string;
};

/**
 * A toolbar action with an icon and a label. The label hides on phones (the
 * tooltip and `aria-label` still name it). When `blocked` is set, the action
 * is disabled and its tooltip says why.
 */
const BarAction = forwardRef<HTMLButtonElement, BarActionProps>(
  (props, ref) => {
    const {icon, label, blocked, onClick, ...rest} = props;
    return (
      <Tooltip label={blocked || label}>
        <BarButton
          {...rest}
          ref={ref}
          aria-label={label}
          aria-disabled={blocked ? 'true' : undefined}
          onClick={(e: any) => {
            if (blocked) {
              e.preventDefault();
              e.stopImmediatePropagation?.();
              return;
            }
            onClick?.(e);
          }}
        >
          {icon}
          <span className="BulkActionBar__buttonLabel hidden font-medium sm:inline">
            {label}
          </span>
        </BarButton>
      </Tooltip>
    );
  }
);

/** A menu item that's disabled, with the reason below it, when `blocked`. */
function BlockedMenuItem(props: {
  icon: ComponentChildren;
  blocked: string;
  danger?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <MenuItem
      icon={props.icon}
      danger={props.danger}
      disabled={!!props.blocked}
      onClick={() => props.onClick()}
    >
      {props.children}
      {props.blocked && (
        <div className="BulkActionBar__itemNote mt-0.5 max-w-60 whitespace-normal text-xs text-muted">
          {props.blocked}
        </div>
      )}
    </MenuItem>
  );
}

/**
 * The "Add to release" popover: a searchable list of pending releases, plus a
 * way to create a new release with the selected docs.
 */
function ReleasePicker(props: {
  docs: CMSDoc[];
  onDone: () => void;
  onNewRelease: () => void;
}) {
  const docIds = props.docs.map((doc) => doc.id);
  const {releases, loading, submitting, addToRelease} = useAddToRelease();
  const addToReleaseModal = useAddToReleaseModal({docIds});
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? releases.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q)
      )
    : releases;

  async function onPick(releaseId: string) {
    setPendingId(releaseId);
    const success = await addToRelease(releaseId, docIds);
    setPendingId('');
    if (success) {
      props.onDone();
    }
  }

  return (
    <div className="BulkActionBar__releasePicker flex flex-col">
      <div className="BulkActionBar__releasePicker__header flex flex-col gap-2.5 p-3">
        <div className="BulkActionBar__releasePicker__title text-base font-semibold text-strong">
          Add {docsLabel(docIds.length)} to a release
        </div>
        <TextInput
          className="BulkActionBar__releasePicker__search"
          aria-label="Search releases"
          placeholder="Search releases"
          leftSection={<IconSearch />}
          value={query}
          onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
        />
      </div>
      <div className="BulkActionBar__releasePicker__label px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Pending releases
      </div>
      <div className="BulkActionBar__releasePicker__list flex max-h-64 flex-col overflow-y-auto pb-1.5">
        {loading ? (
          <div className="flex justify-center p-4">
            <Spinner size="sm" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="BulkActionBar__releasePicker__empty px-3 py-4 text-center text-sm text-muted">
            {releases.length === 0
              ? 'No pending releases. Create a new one below.'
              : 'No releases match your search.'}
          </div>
        ) : (
          filtered.map((release) => {
            const releaseDocIds = release.docIds || [];
            const alreadyIn = docIds.filter((id) =>
              releaseDocIds.includes(id)
            ).length;
            const meta = [
              docsLabel(releaseDocIds.length),
              release.scheduledAt
                ? `scheduled ${formatDateTime(release.scheduledAt)}`
                : 'not scheduled',
            ].join(' · ');
            return (
              <button
                key={release.id}
                type="button"
                className="BulkActionBar__releasePicker__release flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none disabled:cursor-wait"
                disabled={submitting}
                onClick={() => onPick(release.id)}
              >
                <span className="BulkActionBar__releasePicker__releaseIcon mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-soft text-violet-strong">
                  {pendingId === release.id ? (
                    <Spinner size="sm" label={null} />
                  ) : (
                    <IconPackage size={14} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="BulkActionBar__releasePicker__releaseId truncate font-mono text-sm font-semibold text-strong">
                    {release.id}
                  </span>
                  <span className="BulkActionBar__releasePicker__releaseMeta truncate text-sm text-muted">
                    {release.description || meta}
                  </span>
                </span>
                {alreadyIn > 0 && (
                  <span className="BulkActionBar__releasePicker__alreadyIn mt-0.5 shrink-0 rounded-sm bg-chip px-1.5 py-0.5 text-xs font-semibold text-muted">
                    {alreadyIn === docIds.length
                      ? 'All already in'
                      : `${alreadyIn} of ${docIds.length} already in`}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="BulkActionBar__releasePicker__footer border-t border-border p-1.5">
        <Button
          className="w-full justify-start"
          variant="subtle"
          icon={<IconPlus />}
          onClick={() => {
            props.onNewRelease();
            addToReleaseModal.open();
          }}
        >
          New release with these docs...
        </Button>
      </div>
    </div>
  );
}

/**
 * Confirms a bulk action, listing the docs it affects. A bulk delete also
 * asks the user to type "delete".
 */
function BulkConfirmDialog(props: {
  type: BulkDialog;
  docs: CMSDoc[];
  onClose: () => void;
  /** Called with the publish message (only used when publishing). */
  onConfirm: (publishMessage: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const type = props.type;

  // Reset the inputs each time the dialog opens.
  useEffect(() => {
    setTyped('');
    setPublishMessage('');
  }, [type]);

  const count = props.docs.length;
  const label = docsLabel(count);

  let title = '';
  let body = '';
  let confirmLabel = '';
  let note = '';
  if (type === 'publish') {
    title = `Publish ${label}`;
    body = 'Are you sure you want to publish the following docs?';
    confirmLabel = `Publish ${label}`;
  } else if (type === 'archive') {
    title = `Archive ${label}`;
    body =
      'Are you sure you want to archive the following docs? Archived docs are hidden from the collection list by default but can be restored later.';
    confirmLabel = `Archive ${label}`;
  } else if (type === 'unpublish') {
    title = `Unpublish ${label}`;
    body =
      'Are you sure you want to unpublish the following docs? There is no undo.';
    confirmLabel = `Unpublish ${label}`;
  } else if (type === 'delete') {
    title = `Delete ${label}`;
    body =
      'Are you sure you want to delete the following docs? There is no undo.';
    confirmLabel = `Delete ${label}`;
    const published = props.docs.filter((doc) => !!doc.sys?.publishedAt);
    if (published.length > 0) {
      note =
        published.length === 1
          ? `1 of these docs is published (${published[0].id}). Deleting it also removes the published version.`
          : `${published.length} of these docs are published. Deleting them also removes their published versions.`;
    }
  }

  const needsTyping = type === 'delete';
  const confirmDisabled =
    needsTyping && typed.trim().toLowerCase() !== DELETE_CONFIRM_WORD;

  return (
    <Dialog
      className="BulkConfirmDialog"
      open={!!type}
      onClose={() => props.onClose()}
      title={title}
      footer={
        <>
          <Button size="xs" onClick={() => props.onClose()}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant={type === 'publish' ? 'primary' : 'danger'}
            disabled={confirmDisabled}
            onClick={() => props.onConfirm(publishMessage)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="BulkConfirmDialog__body flex flex-col gap-3">
        <p className="BulkConfirmDialog__text m-0 text-pretty text-md font-semibold">
          {body}
        </p>
        <div className="BulkConfirmDialog__docs flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-hover p-2.5">
          {props.docs.map((doc) => (
            <code
              key={doc.id}
              className="BulkConfirmDialog__docId inline-flex break-all rounded-sm bg-chip px-2 py-1 font-mono text-sm font-semibold leading-normal"
            >
              {doc.id}
            </code>
          ))}
        </div>
        {note && (
          <div className="BulkConfirmDialog__note flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-2.5 py-2 text-md text-warning">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </div>
        )}
        {type === 'publish' && (
          <TextInput
            className="BulkConfirmDialog__publishMessage"
            label="Publish message (optional)"
            placeholder="What changed?"
            value={publishMessage}
            onInput={(e: Event) =>
              setPublishMessage((e.target as HTMLInputElement).value)
            }
          />
        )}
        {needsTyping && (
          <TextInput
            className="BulkConfirmDialog__confirmInput"
            classNames={{input: 'font-mono'}}
            label={
              <>
                Type <b className="font-mono">{DELETE_CONFIRM_WORD}</b> to
                confirm
              </>
            }
            autoComplete="off"
            value={typed}
            onInput={(e: Event) =>
              setTyped((e.target as HTMLInputElement).value)
            }
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' && !confirmDisabled) {
                props.onConfirm(publishMessage);
              }
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

interface BulkFailure {
  docId: string;
  error: unknown;
}

/**
 * Calls `action` for each doc id, a few at a time, and returns the docs that
 * failed.
 */
async function runInChunks(
  docIds: string[],
  action: (docId: string) => Promise<void>
): Promise<BulkFailure[]> {
  const failures: BulkFailure[] = [];
  for (let i = 0; i < docIds.length; i += BULK_CONCURRENCY) {
    const chunk = docIds.slice(i, i + BULK_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((id) => action(id)));
    results.forEach((result, j) => {
      if (result.status === 'rejected') {
        console.error(`bulk action failed for ${chunk[j]}`, result.reason);
        failures.push({docId: chunk[j], error: result.reason});
      }
    });
  }
  return failures;
}

/** Describes a partly failed bulk action, listing the first few failures. */
function failureMessage(
  verb: string,
  succeededCount: number,
  pastVerb: string,
  failures: BulkFailure[]
): string {
  const lines = failures
    .slice(0, MAX_LISTED_FAILURES)
    .map((f) => `${f.docId}: ${errorMessage(f.error)}`);
  const more = failures.length - MAX_LISTED_FAILURES;
  if (more > 0) {
    lines.push(`and ${more} more`);
  }
  const prefix =
    succeededCount > 0
      ? `${capitalize(pastVerb)} ${docsLabel(succeededCount)}. `
      : '';
  return `${prefix}Couldn't ${verb}: ${lines.join('; ')}`;
}

/** "1 doc" or "3 docs". */
function docsLabel(count: number): string {
  return count === 1 ? '1 doc' : `${count} docs`;
}

/** E.g. "2 selected docs are archived." */
function docsAre(count: number, state: string): string {
  return count === 1
    ? `1 selected doc is ${state}.`
    : `${count} selected docs are ${state}.`;
}

/** "it" or "them". */
function them(count: number): string {
  return count === 1 ? 'it' : 'them';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
