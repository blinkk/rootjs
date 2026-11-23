import {
  IconArchive,
  IconArchiveOff,
  IconCopy,
  IconDotsVertical,
  IconExternalLink,
  IconLayoutDashboard,
  IconMessageCircle,
  IconPencil,
  IconPlus,
  IconSearch,
  IconShare,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import type {ComponentChildren, JSX} from 'preact';
import {useCallback, useEffect, useId, useMemo, useState} from 'preact/hooks';
import type {
  PrototypeBoardStatus,
  PrototypeBoardSummary,
} from '../../../../../shared/prototypes.js';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DataLoadError} from '../../../../components/DataLoadError/DataLoadError.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {RelativeTime} from '../../../../components/RelativeTime/RelativeTime.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {
  notifyErrors,
  showErrorNotification,
} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testCanEdit} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {useUserProfiles} from '../../../users/useUserProfile.js';
import {NewPrototypeModal} from '../../components/NewPrototypeModal/NewPrototypeModal.js';
import {
  apiDeletePrototypeBoard,
  apiDuplicatePrototypeBoard,
  apiListPrototypeBoards,
  apiUpdatePrototypeBoard,
} from '../../prototypes-client.js';

/** Sort order options for the prototypes gallery. */
type PrototypeSortOption = 'updated' | 'title';

const FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: PrototypeBoardStatus;
}> = [
  {label: 'Active', value: 'active'},
  {label: 'Archived', value: 'archived'},
];

const SORT_OPTIONS: Array<{value: PrototypeSortOption; label: string}> = [
  {value: 'updated', label: 'Recently updated'},
  {value: 'title', label: 'Title A–Z'},
];

/** Formats a singular or plural count label, e.g. `1 frame` or `3 frames`. */
function pluralize(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${noun}`;
}

/**
 * Prototypes gallery page (`/cms/prototypes`) displaying visual board cards,
 * active/archived filtering, search, sorting, and board management actions.
 */
export function PrototypesPage() {
  usePageTitle('Prototypes');
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase?.user?.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  const modals = useModals();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [boards, setBoards] = useState<PrototypeBoardSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<PrototypeSortOption>('updated');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] =
    useState<PrototypeBoardSummary | null>(null);
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);

  const [storedFilter, setFilter] = useLocalStorage<PrototypeBoardStatus>(
    'root-cms-prototypes-filter',
    'active'
  );
  const filter: PrototypeBoardStatus =
    storedFilter === 'archived' ? 'archived' : 'active';

  const loadBoards = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await withTimeout(
        apiListPrototypeBoards({status: 'all'}),
        undefined,
        'loading prototypes'
      );
      setBoards(list);
    } catch (err) {
      setLoadError(err);
      showErrorNotification(err, {
        title: 'Failed to load prototypes',
        dedupe: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const filterCounts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const board of boards) {
      if (board.status === 'archived') {
        archived += 1;
      } else {
        active += 1;
      }
    }
    return {active, archived};
  }, [boards]);

  const filteredBoards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = boards.filter((board) => {
      const status: PrototypeBoardStatus =
        board.status === 'archived' ? 'archived' : 'active';
      if (status !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        board.title,
        board.description,
        board.createdBy,
        board.updatedBy,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    const sorted = [...matching];
    sorted.sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
        });
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return sorted;
  }, [boards, filter, searchQuery, sortBy]);

  // Bulk-load user profiles so cards reuse cached avatar data.
  const authorEmails = useMemo(
    () =>
      Array.from(
        new Set(
          boards
            .map((board) => board.updatedBy || board.createdBy)
            .filter(Boolean)
        )
      ),
    [boards]
  );
  const {profiles} = useUserProfiles(authorEmails);

  async function handleDuplicate(board: PrototypeBoardSummary) {
    setBusyBoardId(board.id);
    try {
      await notifyErrors(async () => {
        const duplicated = await apiDuplicatePrototypeBoard({
          boardId: board.id,
        });
        setBoards((prev) => [duplicated, ...prev]);
        showNotification({
          title: 'Prototype duplicated',
          message: `Created "${duplicated.title}".`,
          color: 'green',
        });
      });
    } finally {
      setBusyBoardId(null);
    }
  }

  async function handleShare(board: PrototypeBoardSummary) {
    const url = `${window.location.origin}/cms/prototypes/${board.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotification({
        message: 'Link copied to clipboard',
        color: 'green',
      });
    } catch (err) {
      showErrorNotification(err, {
        title: 'Failed to copy link',
        dedupe: false,
      });
    }
  }

  async function handleToggleArchive(board: PrototypeBoardSummary) {
    const nextStatus: PrototypeBoardStatus =
      board.status === 'archived' ? 'active' : 'archived';
    setBusyBoardId(board.id);
    try {
      await notifyErrors(async () => {
        const updated = await apiUpdatePrototypeBoard({
          boardId: board.id,
          status: nextStatus,
        });
        setBoards((prev) =>
          prev.map((item) =>
            item.id === board.id
              ? {
                  ...item,
                  status: updated.status,
                  updatedAt: updated.updatedAt,
                  updatedBy: updated.updatedBy,
                }
              : item
          )
        );
        showNotification({
          message:
            nextStatus === 'archived'
              ? `Archived "${board.title}".`
              : `Restored "${board.title}".`,
          color: 'green',
        });
      });
    } finally {
      setBusyBoardId(null);
    }
  }

  function handleDelete(board: PrototypeBoardSummary) {
    modals.openConfirmModal({
      title: 'Delete prototype',
      centered: true,
      children: (
        <Text as="p" size="body-sm" className="m-0">
          Are you sure you want to permanently delete{' '}
          <strong className="font-semibold text-strong">{board.title}</strong>?
          All frames and comments on this board will be removed. This action
          cannot be undone.
        </Text>
      ),
      labels: {confirm: 'Delete', cancel: 'Cancel'},
      confirmProps: {color: 'red'},
      onConfirm: async () => {
        setBusyBoardId(board.id);
        try {
          await notifyErrors(async () => {
            await apiDeletePrototypeBoard(board.id);
            setBoards((prev) => prev.filter((item) => item.id !== board.id));
            showNotification({
              message: `Deleted "${board.title}".`,
              color: 'green',
            });
          });
        } finally {
          setBusyBoardId(null);
        }
      },
    });
  }

  const showOnboardingEmpty =
    !loading &&
    !loadError &&
    filter === 'active' &&
    filterCounts.active === 0 &&
    !searchQuery.trim();

  const showControls =
    !loading && !loadError && (boards.length > 0 || filter === 'archived');

  return (
    <Layout>
      <div className="PrototypesPage bg-page p-page">
        <div className="PrototypesPage__header mb-6 flex max-w-7xl flex-wrap items-start justify-between gap-4">
          <div className="PrototypesPage__headerText min-w-0 grow basis-72">
            <Heading size="h1">Prototypes</Heading>
            <Text as="p" className="mb-0 mt-2 max-w-prose" color="gray">
              Explore page layouts, gather team comments, and iterate on UX
              wireframes with Root AI in an isolated artboard.
            </Text>
          </div>
          <div className="PrototypesPage__headerActions shrink-0">
            <ConditionalTooltip
              label="You don't have permission to create prototypes"
              condition={!canEdit}
            >
              <Button
                variant="primary"
                size="md"
                icon={<IconPlus />}
                disabled={!canEdit}
                onClick={() => setNewModalOpen(true)}
              >
                New prototype
              </Button>
            </ConditionalTooltip>
          </div>
        </div>

        {loading && (
          <div className="PrototypesPage__loading flex max-w-7xl items-center gap-2.5 py-12 text-sm text-muted">
            <Spinner size="md" label="Loading prototypes" />
            <span>Loading prototypes…</span>
          </div>
        )}

        {!loading && Boolean(loadError) && (
          <div className="PrototypesPage__error max-w-7xl">
            <DataLoadError
              title="Failed to load prototypes"
              error={loadError}
            />
          </div>
        )}

        {showControls && (
          <div className="PrototypesPage__controls mb-6 flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SegmentedControl
              aria-label="Prototype status filters"
              size="md"
              value={filter}
              onValueChange={(value) => setFilter(value)}
              data={FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: (
                  <span className="PrototypesPage__filter flex items-center justify-center gap-1.5 whitespace-nowrap">
                    {option.label}
                    <span className="PrototypesPage__filterCount rounded-full bg-chip px-1.5 text-xs leading-4 text-muted">
                      {filterCounts[option.value]}
                    </span>
                  </span>
                ),
              }))}
            />
            <div className="PrototypesPage__searchSort flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center md:ml-auto">
              <TextInput
                className="PrototypesPage__search w-full sm:w-64"
                aria-label="Search prototypes"
                placeholder="Search prototypes…"
                size="md"
                leftSection={<IconSearch />}
                value={searchQuery}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                rightSection={
                  searchQuery ? (
                    <IconButton
                      size="xs"
                      variant="subtle"
                      label="Clear search"
                      tooltip={false}
                      onClick={() => setSearchQuery('')}
                    >
                      <IconX />
                    </IconButton>
                  ) : undefined
                }
              />
              <Select
                className="PrototypesPage__sort w-full sm:w-44"
                aria-label="Sort prototypes"
                size="md"
                data={SORT_OPTIONS}
                value={sortBy}
                onValueChange={(value) => {
                  if (value) {
                    setSortBy(value as PrototypeSortOption);
                  }
                }}
              />
            </div>
          </div>
        )}

        {showOnboardingEmpty && (
          <PrototypesEmptyState
            canEdit={canEdit}
            onCreate={() => setNewModalOpen(true)}
          />
        )}

        {!loading &&
          !loadError &&
          !showOnboardingEmpty &&
          filteredBoards.length === 0 && (
            <Surface className="PrototypesPage__noResults flex max-w-7xl flex-col items-center gap-3 rounded-xl px-5 py-12 text-center">
              <Text as="p" size="body-sm" color="gray" className="m-0">
                {searchQuery.trim()
                  ? `No ${filter === 'archived' ? 'archived ' : ''}prototypes match "${searchQuery.trim()}".`
                  : filter === 'archived'
                    ? 'No archived prototypes.'
                    : 'No prototypes yet.'}
              </Text>
              {searchQuery.trim() && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </Button>
              )}
            </Surface>
          )}

        {!loading && !loadError && filteredBoards.length > 0 && (
          <div className="PrototypesPage__grid grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => {
              const authorEmail = board.updatedBy || board.createdBy || '';
              const authorKey = authorEmail.toLowerCase();
              const authorProfile = profiles.has(authorKey)
                ? profiles.get(authorKey)
                : undefined;
              return (
                <PrototypeBoardCard
                  key={board.id}
                  board={board}
                  authorProfile={authorProfile}
                  canEdit={canEdit}
                  busy={busyBoardId === board.id}
                  onRename={() => setRenameTarget(board)}
                  onDuplicate={() => handleDuplicate(board)}
                  onShare={() => handleShare(board)}
                  onToggleArchive={() => handleToggleArchive(board)}
                  onDelete={() => handleDelete(board)}
                />
              );
            })}
          </div>
        )}

        <NewPrototypeModal
          open={newModalOpen}
          onClose={() => setNewModalOpen(false)}
          onCreated={(bundle) => {
            const summary: PrototypeBoardSummary = {
              ...bundle.board,
              frameCount: bundle.frames.length,
              pageFrameCounts: {},
              openCommentCount: 0,
            };
            setBoards((prev) => [summary, ...prev]);
          }}
        />

        <RenamePrototypeDialog
          board={renameTarget}
          onClose={() => setRenameTarget(null)}
          onUpdated={(updated) => {
            setBoards((prev) =>
              prev.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      title: updated.title,
                      description: updated.description,
                      updatedAt: updated.updatedAt,
                      updatedBy: updated.updatedBy,
                    }
                  : item
              )
            );
          }}
        />
      </div>
    </Layout>
  );
}

/** Props for `PrototypeBoardCard`. */
interface PrototypeBoardCardProps {
  /** Prototype board summary data. */
  board: PrototypeBoardSummary;
  /** Optional bulk-loaded user profile for the last modifier. */
  authorProfile?: ReturnType<typeof useUserProfiles>['profiles'] extends Map<
    string,
    infer V
  >
    ? V
    : never;
  /** Whether the current user can modify or delete boards. */
  canEdit: boolean;
  /** Whether an async mutation is currently running on this card. */
  busy: boolean;
  /** Opens the rename dialog for this board. */
  onRename: () => void;
  /** Duplicates this board. */
  onDuplicate: () => void;
  /** Copies a shareable URL for this board. */
  onShare: () => void;
  /** Archives or restores this board. */
  onToggleArchive: () => void;
  /** Prompts to permanently delete this board. */
  onDelete: () => void;
}

/**
 * Gallery card representing a single prototype board, with a miniature artboard
 * preview, metadata summary, and overflow actions menu.
 */
function PrototypeBoardCard(props: PrototypeBoardCardProps) {
  const {board, canEdit, busy} = props;
  const href = `/cms/prototypes/${board.id}`;
  const isArchived = board.status === 'archived';
  const openComments = board.openCommentCount ?? 0;
  const authorEmail = board.updatedBy || board.createdBy || '';
  const displayTitle = board.title || 'Untitled prototype';

  return (
    <Surface
      className={cn(
        'PrototypesPage__card group flex flex-col rounded-xl shadow-sm transition-shadow hover:shadow-md',
        isArchived && 'PrototypesPage__card--archived',
        busy && 'opacity-70'
      )}
    >
      <a
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="PrototypesPage__thumbnail relative block h-36 overflow-hidden border-0 border-b border-solid border-border bg-surface-subtle no-underline"
      >
        <PrototypeThumbnailPreview previewFrames={board.previewFrames} />
        {(isArchived || openComments > 0) && (
          <div className="PrototypesPage__thumbnailBadges pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5">
            {isArchived && (
              <Badge
                tone="neutral"
                variant="outline"
                size="xs"
                className="bg-surface"
              >
                Archived
              </Badge>
            )}
            {openComments > 0 && (
              <Badge
                tone="info"
                variant="soft"
                size="xs"
                icon={<IconMessageCircle />}
                className="border border-info-line"
              >
                {openComments}
              </Badge>
            )}
          </div>
        )}
      </a>

      <div className="PrototypesPage__cardBody flex flex-1 flex-col bg-surface p-4">
        <div className="PrototypesPage__cardTop flex items-start justify-between gap-2">
          <a
            href={href}
            className="PrototypesPage__cardTitle min-w-0 flex-1 break-words text-base font-semibold leading-snug text-strong no-underline underline-offset-3 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {displayTitle}
          </a>
          <Menu
            placement="bottom-end"
            trigger={
              <IconButton
                label={`Actions for ${displayTitle}`}
                size="xs"
                variant="subtle"
                loading={busy}
                className="PrototypesPage__cardMenuTrigger -mr-1 -mt-0.5 shrink-0"
              >
                <IconDotsVertical />
              </IconButton>
            }
          >
            <MenuItem icon={<IconExternalLink />} href={href}>
              Open
            </MenuItem>
            <MenuItem
              icon={<IconPencil />}
              disabled={!canEdit}
              onClick={props.onRename}
            >
              Rename…
            </MenuItem>
            <MenuItem
              icon={<IconCopy />}
              disabled={!canEdit}
              onClick={props.onDuplicate}
            >
              Duplicate
            </MenuItem>
            <MenuItem icon={<IconShare />} onClick={props.onShare}>
              Share (Copy link)
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={isArchived ? <IconArchiveOff /> : <IconArchive />}
              disabled={!canEdit}
              onClick={props.onToggleArchive}
            >
              {isArchived ? 'Restore' : 'Archive'}
            </MenuItem>
            <MenuItem
              icon={<IconTrash />}
              danger
              disabled={!canEdit}
              onClick={props.onDelete}
            >
              Delete…
            </MenuItem>
          </Menu>
        </div>

        {board.description && (
          <p className="PrototypesPage__cardDescription mb-0 mt-1 line-clamp-2 text-sm text-muted">
            {board.description}
          </p>
        )}

        <div className="PrototypesPage__cardMeta mt-auto flex items-center gap-2 pt-3 text-xs text-muted">
          {openComments > 0 && (
            <span className="sr-only">
              {pluralize(openComments, 'open comment')}
            </span>
          )}
          {authorEmail && (
            <UserAvatar
              email={authorEmail}
              profile={props.authorProfile}
              size={20}
            />
          )}
          <RelativeTime ts={board.updatedAt} className="text-xs text-muted" />
        </div>
      </div>
    </Surface>
  );
}

/**
 * Miniature dot-grid artboard preview rendered inside a card thumbnail,
 * displaying up to 3 mini wireframe frames or tasteful placeholder frames.
 */
function PrototypeThumbnailPreview(props: {
  previewFrames?: PrototypeBoardSummary['previewFrames'];
}) {
  const patternId = useId();
  const frames = (props.previewFrames ?? []).slice(0, 3);

  return (
    <div className="PrototypesPage__thumbnailCanvas relative flex size-full items-end justify-center gap-2.5 px-4 pt-6">
      <svg
        className="PrototypesPage__thumbnailGrid pointer-events-none absolute inset-0 size-full text-border-strong opacity-60"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={patternId}
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="7" cy="7" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      {frames.length > 0 ? (
        frames.map((frame) => {
          const isMobile = frame.width > 0 && frame.width < 600;
          const widthClass = isMobile
            ? 'w-14'
            : frames.length === 1
              ? 'w-44'
              : frames.length === 2
                ? 'w-28'
                : 'w-24';
          const blocks = frame.blockLabels.slice(0, 4);

          return (
            <div
              key={frame.id}
              className={cn(
                'PrototypesPage__miniFrame relative z-1 flex h-28 shrink-0 flex-col overflow-hidden rounded-t-md border border-b-0 border-solid border-border bg-surface shadow-xs transition-transform group-hover:-translate-y-0.5',
                widthClass
              )}
            >
              <div className="PrototypesPage__miniFrameHeader flex h-4 shrink-0 items-center gap-1 border-0 border-b border-solid border-border bg-surface-hover px-1.5">
                <span className="size-1 shrink-0 rounded-full bg-border-strong" />
                <span className="truncate text-2xs leading-none text-muted">
                  {frame.title}
                </span>
              </div>
              <div className="PrototypesPage__miniFrameBlocks flex flex-1 flex-col gap-1 p-1.5">
                {blocks.length > 0 ? (
                  blocks.map((block, index) => (
                    <div
                      key={`${frame.id}-block-${index}`}
                      className={cn(
                        'PrototypesPage__miniBlock flex flex-col justify-center rounded-sm border border-solid px-1',
                        index === 0 ? 'h-6' : 'h-4',
                        block.proposed
                          ? 'border-violet/30 bg-violet-soft'
                          : 'border-border bg-surface-hover'
                      )}
                    >
                      <span
                        className={cn(
                          'block h-1 rounded-full',
                          index === 0 ? 'w-3/4' : 'w-1/2',
                          block.proposed ? 'bg-violet/40' : 'bg-border-strong'
                        )}
                      />
                    </div>
                  ))
                ) : (
                  <>
                    <div className="h-6 rounded-sm border border-solid border-border bg-surface-hover" />
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-5 rounded-sm bg-chip" />
                      <div className="h-5 rounded-sm bg-chip" />
                    </div>
                    <div className="h-4 rounded-sm bg-surface-hover" />
                  </>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <>
          <div className="PrototypesPage__miniFrame PrototypesPage__miniFrame--placeholder relative z-1 flex h-24 w-28 shrink-0 flex-col overflow-hidden rounded-t-md border border-b-0 border-dashed border-border-strong bg-surface/85 shadow-xs">
            <div className="flex h-3.5 items-center gap-1 border-0 border-b border-solid border-border bg-surface-hover px-1.5">
              <span className="size-1 rounded-full bg-border-strong" />
              <span className="h-1 w-8 rounded-full bg-border-strong" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-1.5">
              <div className="h-5 rounded-sm bg-surface-hover" />
              <div className="grid grid-cols-3 gap-1">
                <div className="h-5 rounded-sm bg-chip" />
                <div className="h-5 rounded-sm bg-chip" />
                <div className="h-5 rounded-sm bg-chip" />
              </div>
              <div className="h-3 rounded-sm bg-surface-hover" />
            </div>
          </div>
          <div className="PrototypesPage__miniFrame PrototypesPage__miniFrame--placeholder relative z-1 flex h-20 w-16 shrink-0 flex-col overflow-hidden rounded-t-md border border-b-0 border-dashed border-border-strong bg-surface/85 shadow-xs">
            <div className="flex h-3.5 items-center gap-1 border-0 border-b border-solid border-border bg-surface-hover px-1.5">
              <span className="h-1 w-5 rounded-full bg-border-strong" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-1.5">
              <div className="h-4 rounded-sm bg-surface-hover" />
              <div className="h-4 rounded-sm bg-chip" />
              <div className="h-3 rounded-sm bg-surface-hover" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A single step in the empty state's onboarding guide. */
interface EmptyStateStep {
  icon: ComponentChildren;
  title: string;
  description: string;
}

const EMPTY_STATE_STEPS: EmptyStateStep[] = [
  {
    icon: <IconLayoutDashboard size={20} stroke={1.5} />,
    title: 'Start an artboard',
    description:
      'Create a board to arrange desktop and mobile page explorations side by side.',
  },
  {
    icon: <IconSparkles size={20} stroke={1.5} />,
    title: 'Iterate with Root AI',
    description:
      'Compose with existing site components or propose net-new blocks safely.',
  },
  {
    icon: <IconMessageCircle size={20} stroke={1.5} />,
    title: 'Collect team feedback',
    description:
      'Pin comments directly onto frames and components, then resolve threads together.',
  },
];

/** Inviting empty state shown when no active prototype boards exist yet. */
function PrototypesEmptyState(props: {canEdit: boolean; onCreate: () => void}) {
  return (
    <Surface className="PrototypesPage__emptyState flex max-w-7xl flex-col items-center rounded-xl px-4 py-12 text-center md:px-6">
      <div className="PrototypesPage__emptyStateArt mb-5 flex items-end justify-center gap-2 rounded-xl border border-solid border-border bg-surface-subtle px-5 pt-4">
        <div className="flex h-16 w-20 flex-col gap-1 rounded-t-md border border-b-0 border-solid border-border bg-surface p-1.5 shadow-xs">
          <div className="h-2.5 w-10 rounded-sm bg-chip" />
          <div className="grid grid-cols-2 gap-1">
            <div className="h-5 rounded-sm bg-surface-hover" />
            <div className="h-5 rounded-sm bg-violet-soft" />
          </div>
          <div className="h-2.5 rounded-sm bg-surface-hover" />
        </div>
        <div className="flex h-12 w-12 flex-col gap-1 rounded-t-md border border-b-0 border-solid border-border bg-surface p-1.5 shadow-xs">
          <div className="h-2 w-6 rounded-sm bg-chip" />
          <div className="h-4 rounded-sm bg-surface-hover" />
        </div>
      </div>

      <Heading size="h2" className="PrototypesPage__emptyStateTitle">
        No prototypes yet
      </Heading>
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="PrototypesPage__emptyStateDescription mx-auto mb-0 mt-2 max-w-md"
      >
        Prototypes give your team an isolated canvas to explore page layouts,
        preview wireframes with Root AI, and review changes before touching live
        content.
      </Text>

      <ol className="PrototypesPage__steps mx-0 my-8 grid w-full max-w-3xl list-none grid-cols-1 gap-4 p-0 text-left md:grid-cols-3">
        {EMPTY_STATE_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="PrototypesPage__step flex gap-3 rounded-lg border border-solid border-border p-4"
          >
            <div className="PrototypesPage__stepIcon shrink-0 text-muted">
              {step.icon}
            </div>
            <div className="PrototypesPage__stepBody flex flex-col gap-1">
              <Text size="body-sm" weight="semi-bold">
                {i + 1}. {step.title}
              </Text>
              <Text size="body-sm" color="gray">
                {step.description}
              </Text>
            </div>
          </li>
        ))}
      </ol>

      <ConditionalTooltip
        label="You don't have permission to create prototypes"
        condition={!props.canEdit}
      >
        <Button
          variant="primary"
          size="md"
          icon={<IconPlus />}
          disabled={!props.canEdit}
          onClick={props.onCreate}
        >
          Create prototype
        </Button>
      </ConditionalTooltip>
    </Surface>
  );
}

/** Dialog for renaming a prototype board and editing its description. */
function RenamePrototypeDialog(props: {
  board: PrototypeBoardSummary | null;
  onClose: () => void;
  onUpdated: (updated: {
    id: string;
    title: string;
    description?: string;
    updatedAt: number;
    updatedBy: string;
  }) => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (props.board) {
      setTitle(props.board.title || '');
      setDescription(props.board.description || '');
      setTitleError('');
      setSaving(false);
    }
  }, [props.board]);

  function handleClose() {
    if (saving) {
      return;
    }
    props.onClose();
  }

  async function handleSubmit(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!props.board || saving) {
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError('Please enter a title for this prototype.');
      return;
    }
    setTitleError('');
    setSaving(true);
    try {
      const updated = await apiUpdatePrototypeBoard({
        boardId: props.board.id,
        title: trimmedTitle,
        description: description.trim(),
      });
      props.onUpdated(updated);
      showNotification({
        message: 'Prototype updated',
        color: 'green',
      });
      props.onClose();
    } catch (err) {
      showErrorNotification(err, {
        title: 'Failed to update prototype',
        dedupe: false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(props.board)}
      onClose={handleClose}
      title="Rename prototype"
      size="sm"
      closeOnEscape={!saving}
      closeOnClickOutside={!saving}
      className="RenamePrototypeDialog"
      footer={
        <>
          <Button
            variant="default"
            size="md"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            size="md"
            loading={saving}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="RenamePrototypeDialog__form flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        <TextInput
          label="Title"
          size="md"
          required
          data-autofocus
          disabled={saving}
          value={title}
          error={titleError || undefined}
          onInput={(e) => {
            setTitle(e.currentTarget.value);
            if (titleError) {
              setTitleError('');
            }
          }}
        />
        <Textarea
          label="Description"
          size="md"
          autosize
          minRows={2}
          maxRows={4}
          disabled={saving}
          value={description}
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
      </form>
    </Dialog>
  );
}
