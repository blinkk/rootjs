import {
  IconArchive,
  IconArchiveOff,
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconFile,
  IconLink,
  IconMessageCircle,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRobot,
  IconTrash,
} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';
import type {
  PrototypeBoard,
  PrototypeFrame,
} from '../../../../../shared/prototypes.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';

/** Active right-hand floating panel on the prototype board. */
export type PrototypeSidePanel = 'comments' | 'ai' | null;

/**
 * Joined segmented button styling matching `DocEditor.StatusBar` (square inner
 * corners, shared `-ml-px` border, and soft blue pressed fill).
 */
const SEGMENTED_GROUP_BUTTON_CLASSES =
  'PrototypeTopBar__segmentButton z-0 -ml-px rounded-none max-md:gap-0 max-md:px-2 group-first/segment:ml-0 group-first/segment:rounded-l-sm group-last/segment:rounded-r-sm ' +
  'aria-pressed:z-10 aria-pressed:border-info-line aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text aria-pressed:hover:bg-button-blue-soft';

/** Props for `PrototypeTopBar`. */
export interface PrototypeTopBarProps {
  /** Current prototype board metadata. */
  board: PrototypeBoard;
  /** All frames on the board (used to show per-page frame counts). */
  frames: PrototypeFrame[];
  /** Currently active page id. */
  activePageId: string;
  /** Total open comment count across the board. */
  openCommentCount: number;
  /** Currently open right-hand floating panel. */
  activePanel: PrototypeSidePanel;
  /** Whether Root AI is enabled for the project. */
  aiAvailable: boolean;
  /** Whether the user can edit this board. */
  canEdit: boolean;
  /** Whether an image export is currently in flight. */
  exporting?: boolean;
  /** Switches the active canvas page. */
  onSelectPage: (pageId: string) => void;
  /** Adds a new page to the board and switches to it. */
  onAddPage: (name: string) => Promise<void>;
  /** Renames an existing page on the board. */
  onRenamePage: (pageId: string, name: string) => Promise<void>;
  /** Renames the board title. */
  onRenameBoard: (title: string) => Promise<void>;
  /** Duplicates the board and navigates to the new board. */
  onDuplicateBoard: () => Promise<void>;
  /** Exports the selected frame (or active page frames) as PNG. */
  onExport: () => Promise<void>;
  /** Archives or restores the board. */
  onToggleArchive: () => Promise<void>;
  /** Deletes the board and navigates back to `/cms/prototypes`. */
  onDeleteBoard: () => Promise<void>;
  /** Toggles the right-hand Comments or Root AI panel. */
  onTogglePanel: (panel: Exclude<PrototypeSidePanel, null>) => void;
}

/**
 * Floating top chrome for the full-bleed prototype canvas:
 * - Top-left: `Prototypes / <Board Title> ▾` menu + `📄 <Active Page> ▾` switcher.
 * - Top-right: `Comments` / `Edit with AI` joined segmented toggle group.
 */
export function PrototypeTopBar(props: PrototypeTopBarProps) {
  const {
    board,
    frames,
    activePageId,
    openCommentCount,
    activePanel,
    aiAvailable,
    canEdit,
    exporting = false,
    onSelectPage,
    onAddPage,
    onRenamePage,
    onRenameBoard,
    onDuplicateBoard,
    onExport,
    onToggleArchive,
    onDeleteBoard,
    onTogglePanel,
  } = props;

  const modals = useModals();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(board.title);
  const [renaming, setRenaming] = useState(false);

  const [addPageOpen, setAddPageOpen] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [addingPage, setAddingPage] = useState(false);

  const [renamePageOpen, setRenamePageOpen] = useState(false);
  const [renamePageValue, setRenamePageValue] = useState('');
  const [renamingPage, setRenamingPage] = useState(false);

  const activePage = useMemo(
    () =>
      board.pages.find((page) => page.id === activePageId) ||
      board.pages[0] || {id: activePageId, name: 'Page'},
    [board.pages, activePageId]
  );

  const pageFrameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const frame of frames) {
      counts[frame.pageId] = (counts[frame.pageId] || 0) + 1;
    }
    return counts;
  }, [frames]);

  async function handleCopyShareLink() {
    const url = new URL(window.location.href);
    url.pathname = `/cms/prototypes/${board.id}`;
    url.searchParams.set('page', activePage.id);
    url.searchParams.delete('prompt');
    try {
      await navigator.clipboard.writeText(url.toString());
      showNotification({
        title: 'Link copied to clipboard',
        message: `Share link for "${board.title}" (${activePage.name}).`,
        color: 'green',
      });
    } catch (err) {
      showNotification({
        title: 'Could not copy link',
        message: errorMessage(err),
        color: 'red',
      });
    }
  }

  async function handleSubmitRename(e: Event) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || renaming) {
      return;
    }
    setRenaming(true);
    try {
      await onRenameBoard(trimmed);
      setRenameOpen(false);
    } catch (err) {
      showNotification({
        title: 'Could not rename prototype',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setRenaming(false);
    }
  }

  async function handleSubmitAddPage(e: Event) {
    e.preventDefault();
    const trimmed = newPageName.trim();
    if (!trimmed || addingPage) {
      return;
    }
    setAddingPage(true);
    try {
      await onAddPage(trimmed);
      setNewPageName('');
      setAddPageOpen(false);
    } catch (err) {
      showNotification({
        title: 'Could not add page',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setAddingPage(false);
    }
  }

  async function handleSubmitRenamePage(e: Event) {
    e.preventDefault();
    const trimmed = renamePageValue.trim();
    if (!trimmed || renamingPage) {
      return;
    }
    setRenamingPage(true);
    try {
      await onRenamePage(activePage.id, trimmed);
      setRenamePageOpen(false);
    } catch (err) {
      showNotification({
        title: 'Could not rename page',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setRenamingPage(false);
    }
  }

  function confirmDeleteBoard() {
    modals.openConfirmModal({
      title: 'Delete prototype',
      children: (
        <p className="m-0 text-base text-fg">
          Permanently delete <strong>{board.title}</strong> and all of its
          frames and comments? This action cannot be undone.
        </p>
      ),
      labels: {confirm: 'Delete prototype', cancel: 'Cancel'},
      confirmProps: {color: 'red'},
      onConfirm: () => {
        onDeleteBoard().catch((err) => {
          showNotification({
            title: 'Could not delete prototype',
            message: errorMessage(err),
            color: 'red',
          });
        });
      },
    });
  }

  const isArchived = board.status === 'archived';

  return (
    <>
      <header className="PrototypeTopBar pointer-events-none absolute inset-x-0 top-0 z-(--cms-z-sticky) flex items-center justify-between gap-2 p-2 md:p-3">
        {/* Top-left floating bar: breadcrumb + board menu + pages switcher. */}
        <div className="PrototypeTopBar__left pointer-events-auto flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-border bg-surface px-1.5 py-1 shadow-sm sm:px-2">
          <a
            href="/cms/prototypes"
            aria-label="Prototypes"
            className="PrototypeTopBar__back inline-flex shrink-0 items-center rounded-sm px-1 py-1 text-sm font-medium text-muted no-underline transition-colors hover:bg-surface-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-1.5"
          >
            <IconArrowLeft size={16} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Prototypes</span>
          </a>
          <span
            className="PrototypeTopBar__slash hidden shrink-0 text-sm text-subtle sm:inline"
            aria-hidden="true"
          >
            /
          </span>

          <Menu
            placement="bottom-start"
            label={`Actions for ${board.title}`}
            trigger={
              <Button
                variant="subtle"
                size="sm"
                className="PrototypeTopBar__boardMenu min-w-0 shrink max-w-28 px-1.5 font-semibold text-strong sm:max-w-56 md:max-w-72"
                iconRight={<IconChevronDown />}
              >
                {board.title}
              </Button>
            }
          >
            {canEdit && (
              <MenuItem
                icon={<IconPencil />}
                onClick={() => {
                  setRenameValue(board.title);
                  setRenameOpen(true);
                }}
              >
                Rename…
              </MenuItem>
            )}
            {canEdit && (
              <MenuItem
                icon={<IconCopy />}
                onClick={() => {
                  onDuplicateBoard().catch((err) => {
                    showNotification({
                      title: 'Could not duplicate prototype',
                      message: errorMessage(err),
                      color: 'red',
                    });
                  });
                }}
              >
                Duplicate
              </MenuItem>
            )}
            <MenuItem icon={<IconLink />} onClick={handleCopyShareLink}>
              Share (Copy link)
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<IconPhoto />}
              disabled={exporting}
              onClick={() => {
                onExport().catch((err) => {
                  showNotification({
                    title: 'Could not export PNG',
                    message: errorMessage(err),
                    color: 'red',
                  });
                });
              }}
            >
              Export as PNG
            </MenuItem>
            {canEdit && (
              <>
                <MenuDivider />
                <MenuItem
                  icon={isArchived ? <IconArchiveOff /> : <IconArchive />}
                  onClick={() => {
                    onToggleArchive().catch((err) => {
                      showNotification({
                        title: isArchived
                          ? 'Could not restore prototype'
                          : 'Could not archive prototype',
                        message: errorMessage(err),
                        color: 'red',
                      });
                    });
                  }}
                >
                  {isArchived ? 'Restore prototype' : 'Archive prototype'}
                </MenuItem>
                <MenuItem
                  danger
                  icon={<IconTrash />}
                  onClick={confirmDeleteBoard}
                >
                  Delete prototype…
                </MenuItem>
              </>
            )}
          </Menu>

          <div
            className="PrototypeTopBar__divider mx-1 h-4 w-px shrink-0 bg-border"
            aria-hidden="true"
          />

          {/* Pages switcher dropdown. */}
          <Menu
            placement="bottom-start"
            label="Switch page"
            trigger={
              <Button
                variant="subtle"
                size="sm"
                className="PrototypeTopBar__pageSwitcher min-w-0 shrink max-w-24 px-1.5 font-medium text-fg sm:max-w-44"
                icon={<IconFile />}
                iconRight={<IconChevronDown />}
              >
                {activePage.name}
              </Button>
            }
          >
            {board.pages.map((page) => {
              const count = pageFrameCounts[page.id] || 0;
              const isCurrent = page.id === activePage.id;
              return (
                <MenuItem
                  key={page.id}
                  icon={
                    isCurrent ? (
                      <IconCheck className="text-info" />
                    ) : (
                      <IconFile className="text-muted" />
                    )
                  }
                  hint={`${count} ${count === 1 ? 'frame' : 'frames'}`}
                  onClick={() => onSelectPage(page.id)}
                >
                  {page.name}
                </MenuItem>
              );
            })}
            {canEdit && (
              <>
                <MenuDivider />
                <MenuItem
                  icon={<IconPencil />}
                  onClick={() => {
                    setRenamePageValue(activePage.name);
                    setRenamePageOpen(true);
                  }}
                >
                  Rename page…
                </MenuItem>
                <MenuItem
                  icon={<IconPlus />}
                  onClick={() => {
                    setNewPageName('');
                    setAddPageOpen(true);
                  }}
                >
                  Add page
                </MenuItem>
              </>
            )}
          </Menu>
        </div>

        {/* Top-right segmented toggle group matching DocEditor.StatusBar. */}
        <div
          className="PrototypeTopBar__right pointer-events-auto flex shrink-0 items-center"
          role="group"
          aria-label="Workspace panels"
        >
          <div className="PrototypeTopBar__commentsSegment group/segment">
            <Button
              variant="default"
              size="sm"
              className={cn(SEGMENTED_GROUP_BUTTON_CLASSES, 'shadow-sm')}
              aria-pressed={activePanel === 'comments'}
              aria-label={
                openCommentCount > 0
                  ? `Comments ${openCommentCount}`
                  : 'Comments'
              }
              icon={<IconMessageCircle />}
              onClick={() => onTogglePanel('comments')}
            >
              <span className="PrototypeTopBar__segmentLabel hidden md:inline">
                Comments
              </span>
              {openCommentCount > 0 && (
                <span className="PrototypeTopBar__commentsCount ml-1 inline-block min-w-4.5 rounded-full bg-button-blue-hover px-1 py-1 text-center text-2xs font-semibold leading-none text-inverse md:ml-2">
                  {openCommentCount}
                </span>
              )}
            </Button>
          </div>
          {aiAvailable && (
            <div className="PrototypeTopBar__aiSegment group/segment">
              <Button
                variant="default"
                size="sm"
                className={cn(SEGMENTED_GROUP_BUTTON_CLASSES, 'shadow-sm')}
                aria-pressed={activePanel === 'ai'}
                aria-label="Edit with AI"
                icon={<IconRobot />}
                onClick={() => onTogglePanel('ai')}
              >
                <span className="PrototypeTopBar__segmentLabel hidden md:inline">
                  Edit with AI
                </span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Rename board modal. */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename prototype"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={renaming}
              disabled={!renameValue.trim()}
              onClick={handleSubmitRename}
            >
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRename}>
          <TextInput
            label="Title"
            value={renameValue}
            onInput={(e) => setRenameValue(e.currentTarget.value)}
            placeholder="e.g. Pricing page refresh"
            required
            data-autofocus
          />
        </form>
      </Dialog>

      {/* Add page modal. */}
      <Dialog
        open={addPageOpen}
        onClose={() => setAddPageOpen(false)}
        title="Add page"
        size="sm"
        footer={
          <>
            <Button onClick={() => setAddPageOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={addingPage}
              disabled={!newPageName.trim()}
              onClick={handleSubmitAddPage}
            >
              Add page
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitAddPage}>
          <TextInput
            label="Page name"
            value={newPageName}
            onInput={(e) => setNewPageName(e.currentTarget.value)}
            placeholder="e.g. Page 2"
            required
            data-autofocus
          />
        </form>
      </Dialog>

      {/* Rename page modal. */}
      <Dialog
        open={renamePageOpen}
        onClose={() => setRenamePageOpen(false)}
        title="Rename page"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenamePageOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={renamingPage}
              disabled={!renamePageValue.trim()}
              onClick={handleSubmitRenamePage}
            >
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRenamePage}>
          <TextInput
            label="Page name"
            value={renamePageValue}
            onInput={(e) => setRenamePageValue(e.currentTarget.value)}
            placeholder="e.g. Page 1"
            required
            data-autofocus
          />
        </form>
      </Dialog>
    </>
  );
}
