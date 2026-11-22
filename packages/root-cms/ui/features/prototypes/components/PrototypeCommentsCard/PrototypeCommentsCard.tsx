import {
  IconArrowBackUp,
  IconCheck,
  IconMessageCircle,
  IconRobot,
  IconSend2,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import type {
  PrototypeCommentAnchor,
  PrototypeCommentItem,
  PrototypeCommentThread,
} from '../../../../../shared/prototypes.js';
import {
  extractRichTextMentions,
  getRichTextPlainText,
  type RichTextData,
  type RichTextListItem,
} from '../../../../../shared/richtext.js';
import {RelativeTime} from '../../../../components/RelativeTime/RelativeTime.js';
import {useMediaQuery} from '../../../../hooks/useMediaQuery.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {
  CommentBody,
  richTextFromPlainText,
} from '../../../comments/CommentBody/CommentBody.js';
import {CommentEditor} from '../../../comments/CommentEditor/CommentEditor.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {UserTag} from '../../../users/UserTag/UserTag.js';

/** Matches the `md` breakpoint (`768px`). */
const DESKTOP_QUERY = '(width >= 48rem)';

/** Filter modes for `PrototypeCommentsCard`. */
type CommentsFilter = 'open' | 'current-page' | 'resolved';

/** Serializes a `RichTextData` payload from `CommentEditor` into HTML for the prototype comment API. */
function serializeRichTextToHtml(data: RichTextData): string {
  const parts: string[] = [];
  for (const block of data.blocks || []) {
    if (block.type === 'paragraph' && block.data?.text) {
      parts.push(`<p>${block.data.text}</p>`);
    } else if (block.type === 'heading' && block.data?.text) {
      parts.push(`<p><strong>${block.data.text}</strong></p>`);
    } else if (block.type === 'quote' && block.data?.text) {
      parts.push(`<blockquote>${block.data.text}</blockquote>`);
    } else if (
      (block.type === 'unorderedList' || block.type === 'orderedList') &&
      block.data?.items?.length
    ) {
      const tag = block.type === 'orderedList' ? 'ol' : 'ul';
      const items = block.data.items
        .map((item: RichTextListItem) => `<li>${item.content || ''}</li>`)
        .join('');
      parts.push(`<${tag}>${items}</${tag}>`);
    }
  }
  return parts.join('') || '';
}

/** Converts a stored `PrototypeCommentItem` into `RichTextData` for `CommentBody`. */
function commentItemToRichText(
  item: PrototypeCommentItem
): RichTextData | null {
  if (item.body && item.body.trim()) {
    const trimmed = item.body.trim();
    // Parse `<p>` paragraphs so `@mention` links render via `UserTag`.
    const paragraphs: string[] = [];
    const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(trimmed)) !== null) {
      if (match[1].trim()) {
        paragraphs.push(match[1]);
      }
    }
    if (paragraphs.length > 0) {
      return {
        blocks: paragraphs.map((text) => ({type: 'paragraph', data: {text}})),
        time: item.createdAt,
        version: 'prototype-html',
      };
    }
    return {
      blocks: [{type: 'paragraph', data: {text: trimmed}}],
      time: item.createdAt,
      version: 'prototype-html',
    };
  }
  if (item.content) {
    return richTextFromPlainText(item.content);
  }
  return null;
}

/** Props for the floating right-hand Comments card. */
export interface PrototypeCommentsCardProps {
  /** All comment threads on the board. */
  threads: PrototypeCommentThread[];
  /** Currently active board page id. */
  activePageId: string;
  /** Whether Root AI is enabled for the project. */
  aiAvailable: boolean;
  /** Currently focused thread id, if any. */
  activeThreadId: string | null;
  /** Called when the user clicks a thread header to pan/zoom to its anchor. */
  onNavigateToThread: (thread: PrototypeCommentThread) => void;
  /** Called when the user submits a reply to an existing thread. */
  onAddReply: (input: {
    threadId: string;
    body: string;
    content: string;
    mentions: string[];
  }) => Promise<void>;
  /** Called to resolve or reopen a thread. */
  onSetThreadStatus: (
    threadId: string,
    status: 'open' | 'resolved'
  ) => Promise<void>;
  /** Called to delete an individual comment item. */
  onDeleteComment: (threadId: string, commentId: string) => Promise<void>;
  /** Opens Root AI with `/address-comments ` queued. */
  onAddressCommentsInAi: () => void;
  /** Closes the floating Comments card. */
  onClose: () => void;
}

/**
 * Floating right-hand Comments card for prototype boards (renders inside a
 * full-screen `<Dialog>` sheet below `md` so `375px` viewports stay clean).
 */
export function PrototypeCommentsCard(props: PrototypeCommentsCardProps) {
  const {
    threads,
    activePageId,
    aiAvailable,
    activeThreadId,
    onNavigateToThread,
    onAddReply,
    onSetThreadStatus,
    onDeleteComment,
    onAddressCommentsInAi,
    onClose,
  } = props;

  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [filter, setFilter] = useState<CommentsFilter>('open');

  const openThreads = useMemo(
    () => threads.filter((thread) => thread.status === 'open'),
    [threads]
  );

  const filteredThreads = useMemo(() => {
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    if (filter === 'open') {
      return sorted.filter((thread) => thread.status === 'open');
    }
    if (filter === 'resolved') {
      return sorted.filter((thread) => thread.status === 'resolved');
    }
    return sorted.filter((thread) => thread.anchor.pageId === activePageId);
  }, [threads, filter, activePageId]);

  const panelBody = (
    <div className="PrototypeCommentsCard__inner flex min-h-0 flex-1 flex-col">
      {/* Filter tabs + Address comments in AI CTA. */}
      <div className="PrototypeCommentsCard__controls flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2.5">
        <SegmentedControl
          aria-label="Filter comments"
          size="xs"
          fullWidth
          value={filter}
          onValueChange={(value) => setFilter(value as CommentsFilter)}
          data={[
            {value: 'open', label: `Open (${openThreads.length})`},
            {value: 'current-page', label: 'Current page'},
            {value: 'resolved', label: 'Resolved'},
          ]}
        />
        {aiAvailable && openThreads.length > 0 && (
          <Button
            variant="default"
            size="sm"
            fullWidth
            icon={<IconRobot />}
            onClick={onAddressCommentsInAi}
          >
            Address comments in Root AI
          </Button>
        )}
      </div>

      {/* Scrollable thread feed. */}
      <div className="PrototypeCommentsCard__list flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {filteredThreads.length === 0 ? (
          <div className="PrototypeCommentsCard__empty flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-page px-4 py-8 text-center">
            <IconMessageCircle size={24} className="text-muted" />
            <div className="text-sm font-semibold text-fg">
              {filter === 'resolved'
                ? 'No resolved comments'
                : filter === 'current-page'
                  ? 'No comments on this page'
                  : 'No open comments'}
            </div>
            <p className="m-0 text-xs text-muted">
              Press <kbd className="font-mono font-semibold">C</kbd> or pick the
              Comment tool in the dock to pin feedback directly on any frame.
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => (
            <PrototypeThreadItem
              key={thread.id}
              thread={thread}
              highlighted={thread.id === activeThreadId}
              onNavigate={() => onNavigateToThread(thread)}
              onAddReply={onAddReply}
              onSetThreadStatus={onSetThreadStatus}
              onDeleteComment={onDeleteComment}
            />
          ))
        )}
      </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Comments"
        size="full"
        className="PrototypeCommentsCard__mobileDialog"
        classNames={{body: 'p-0 flex flex-col'}}
      >
        {panelBody}
      </Dialog>
    );
  }

  return (
    <aside
      aria-label="Comments"
      className="PrototypeCommentsCard fixed right-3 top-14 bottom-16 z-(--cms-z-floating) flex w-90 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
    >
      <div className="PrototypeCommentsCard__header flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="m-0 truncate text-base font-semibold text-strong">
            Comments
          </h2>
          {openThreads.length > 0 && (
            <Badge tone="info" size="xs">
              {openThreads.length} open
            </Badge>
          )}
        </div>
        <IconButton label="Close comments" size="xs" onClick={onClose}>
          <IconX />
        </IconButton>
      </div>
      {panelBody}
    </aside>
  );
}

/** Single thread card used inside `PrototypeCommentsCard` and `PrototypeCommentPopover`. */
function PrototypeThreadItem(props: {
  thread: PrototypeCommentThread;
  highlighted?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
  onAddReply: (input: {
    threadId: string;
    body: string;
    content: string;
    mentions: string[];
  }) => Promise<void>;
  onSetThreadStatus: (
    threadId: string,
    status: 'open' | 'resolved'
  ) => Promise<void>;
  onDeleteComment: (threadId: string, commentId: string) => Promise<void>;
}) {
  const {
    thread,
    highlighted = false,
    compact = false,
    onNavigate,
    onAddReply,
    onSetThreadStatus,
    onDeleteComment,
  } = props;
  const [replyBody, setReplyBody] = useState<RichTextData | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusPending, setStatusPending] = useState(false);

  const currentUserEmail = (window.firebase?.user?.email || '').toLowerCase();
  const isOpen = thread.status === 'open';

  async function handleToggleStatus() {
    if (statusPending) {
      return;
    }
    setStatusPending(true);
    try {
      await onSetThreadStatus(thread.id, isOpen ? 'resolved' : 'open');
    } catch (err) {
      showNotification({
        title: isOpen ? 'Could not resolve thread' : 'Could not reopen thread',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setStatusPending(false);
    }
  }

  async function handleReply() {
    if (!replyBody || submitting) {
      return;
    }
    const content = getRichTextPlainText(replyBody).trim();
    if (!content) {
      return;
    }
    const body = serializeRichTextToHtml(replyBody);
    const mentions = extractRichTextMentions(replyBody);
    setSubmitting(true);
    try {
      await onAddReply({threadId: thread.id, body, content, mentions});
      setReplyBody(null);
      setEditorKey((value) => value + 1);
    } catch (err) {
      showNotification({
        title: 'Could not post reply',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!window.confirm('Delete this comment?')) {
      return;
    }
    try {
      await onDeleteComment(thread.id, commentId);
    } catch (err) {
      showNotification({
        title: 'Could not delete comment',
        message: errorMessage(err),
        color: 'red',
      });
    }
  }

  return (
    <div
      className={cn(
        'PrototypeCommentsCard__thread flex flex-col gap-2.5 rounded-md border bg-surface p-3 transition-colors',
        highlighted ? 'border-focus bg-info-soft/20' : 'border-border',
        compact && 'border-0 p-0'
      )}
    >
      {/* Anchor label & status actions. */}
      <div className="flex items-center justify-between gap-2">
        {onNavigate ? (
          <button
            type="button"
            className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent p-0 text-left font-sans text-xs font-semibold text-strong hover:text-link focus-visible:outline-2 focus-visible:outline-focus"
            onClick={onNavigate}
            title="Pan to anchor"
          >
            <IconMessageCircle size={14} className="shrink-0 text-info" />
            <span className="truncate">{thread.anchorLabel}</span>
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-strong">
            <IconMessageCircle size={14} className="shrink-0 text-info" />
            <span className="truncate">{thread.anchorLabel}</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {!isOpen && (
            <Badge tone="success" size="xs">
              Resolved
            </Badge>
          )}
          <IconButton
            size="xs"
            label={isOpen ? 'Mark as resolved' : 'Reopen thread'}
            loading={statusPending}
            onClick={handleToggleStatus}
          >
            {isOpen ? <IconCheck /> : <IconArrowBackUp />}
          </IconButton>
        </div>
      </div>

      {/* Messages in thread. */}
      <div className="flex max-h-56 flex-col gap-2.5 overflow-y-auto">
        {thread.comments.map((item) => {
          if (item.type !== 'comment') {
            return (
              <div
                key={item.id}
                className="flex items-center gap-1.5 text-xs text-muted"
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-active *:size-3">
                  {item.type === 'resolved' ? (
                    <IconCheck />
                  ) : (
                    <IconArrowBackUp />
                  )}
                </span>
                <span>
                  <UserTag email={item.createdBy} />{' '}
                  {item.type === 'resolved' ? 'resolved' : 'reopened'} this
                  thread
                </span>
                <RelativeTime className="ml-auto" ts={item.createdAt} />
              </div>
            );
          }

          const canDelete = item.createdBy.toLowerCase() === currentUserEmail;
          return (
            <div key={item.id} className="group/comment flex gap-2">
              <div className="shrink-0 pt-0.5">
                <UserAvatar email={item.createdBy} size={22} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="truncate font-semibold text-fg">
                    <UserTag email={item.createdBy} />
                  </span>
                  <RelativeTime ts={item.createdAt} />
                  {canDelete && (
                    <IconButton
                      size="xs"
                      label="Delete comment"
                      className="ml-auto opacity-0 transition-opacity group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 pointer-coarse:opacity-100"
                      onClick={() => handleDelete(item.id)}
                    >
                      <IconTrash />
                    </IconButton>
                  )}
                </div>
                <CommentBody
                  className="text-sm"
                  body={commentItemToRichText(item)}
                  content={item.content}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply composer when thread is open. */}
      {isOpen && (
        <div className="flex flex-col gap-1.5 pt-1">
          <CommentEditor
            key={editorKey}
            variant="minimal"
            mentions
            placeholder="Reply or @mention someone…"
            value={replyBody}
            onChange={setReplyBody}
            onSubmitShortcut={handleReply}
          />
          <div className="flex justify-end">
            <IconButton
              size="xs"
              variant="primary"
              round
              label="Send reply"
              tooltip="Send (⌘ + Enter)"
              disabled={!replyBody || submitting}
              loading={submitting}
              onClick={handleReply}
            >
              <IconSend2 />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pending unsaved pin dropped in Comment mode. */
export interface PrototypeCommentDraft {
  /** Anchor coordinates + frame/block references. */
  anchor: PrototypeCommentAnchor;
  /** Human-readable anchor label shown in the popover header. */
  anchorLabel: string;
  /** Viewport X coordinate where the user clicked. */
  clientX: number;
  /** Viewport Y coordinate where the user clicked. */
  clientY: number;
}

/** Props for the canvas pin popover (either an existing thread or a new pin draft). */
export interface PrototypeCommentPopoverProps {
  /** Existing thread being inspected, if any. */
  thread?: PrototypeCommentThread | null;
  /** Newly dropped pin draft being composed, if any. */
  draft?: PrototypeCommentDraft | null;
  /** Screen X coordinate to anchor the popover near. */
  clientX: number;
  /** Screen Y coordinate to anchor the popover near. */
  clientY: number;
  /** Called when creating a new thread from a draft pin. */
  onCreateThread: (input: {
    anchor: PrototypeCommentAnchor;
    anchorLabel: string;
    body: string;
    content: string;
    mentions: string[];
  }) => Promise<void>;
  /** Called when replying to an existing thread. */
  onAddReply: (input: {
    threadId: string;
    body: string;
    content: string;
    mentions: string[];
  }) => Promise<void>;
  /** Called to resolve or reopen an existing thread. */
  onSetThreadStatus: (
    threadId: string,
    status: 'open' | 'resolved'
  ) => Promise<void>;
  /** Called to delete a comment item. */
  onDeleteComment: (threadId: string, commentId: string) => Promise<void>;
  /** Closes the popover. */
  onClose: () => void;
}

/**
 * Compact floating popover anchored near a clicked comment pin or newly dropped
 * pin on the canvas. Clamps itself inside viewport bounds and closes on Escape.
 */
export function PrototypeCommentPopover(props: PrototypeCommentPopoverProps) {
  const {
    thread,
    draft,
    clientX,
    clientY,
    onCreateThread,
    onAddReply,
    onSetThreadStatus,
    onDeleteComment,
    onClose,
  } = props;

  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [draftBody, setDraftBody] = useState<RichTextData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmitDraft() {
    if (!draft || !draftBody || submitting) {
      return;
    }
    const content = getRichTextPlainText(draftBody).trim();
    if (!content) {
      return;
    }
    const body = serializeRichTextToHtml(draftBody);
    const mentions = extractRichTextMentions(draftBody);
    setSubmitting(true);
    try {
      await onCreateThread({
        anchor: draft.anchor,
        anchorLabel: draft.anchorLabel,
        body,
        content,
        mentions,
      });
      setDraftBody(null);
    } catch (err) {
      showNotification({
        title: 'Could not add comment',
        message: errorMessage(err),
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const content = thread ? (
    <PrototypeThreadItem
      thread={thread}
      compact
      onAddReply={onAddReply}
      onSetThreadStatus={onSetThreadStatus}
      onDeleteComment={onDeleteComment}
    />
  ) : draft ? (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-strong">
        <IconMessageCircle size={14} className="shrink-0 text-info" />
        <span className="truncate">{draft.anchorLabel}</span>
      </div>
      <CommentEditor
        variant="minimal"
        mentions
        autoFocus
        placeholder="Add a comment or @mention someone…"
        value={draftBody}
        onChange={setDraftBody}
        onSubmitShortcut={handleSubmitDraft}
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          variant="primary"
          disabled={!draftBody || submitting}
          loading={submitting}
          onClick={handleSubmitDraft}
        >
          Post
        </Button>
      </div>
    </div>
  ) : null;

  if (!content) {
    return null;
  }

  if (!isDesktop) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={thread ? 'Comment thread' : 'New comment'}
        size="sm"
      >
        {content}
      </Dialog>
    );
  }

  const popoverWidth = 320;
  const padding = 16;
  const maxLeft = Math.max(
    padding,
    (typeof window !== 'undefined' ? window.innerWidth : 1280) -
      popoverWidth -
      padding
  );
  const maxTop = Math.max(
    64,
    (typeof window !== 'undefined' ? window.innerHeight : 800) - 340
  );
  const left = Math.min(maxLeft, Math.max(padding, clientX + 16));
  const top = Math.min(maxTop, Math.max(64, clientY - 24));

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={
        thread ? `Comment thread on ${thread.anchorLabel}` : 'New comment'
      }
      className="PrototypeCommentPopover fixed z-(--cms-z-floating) w-80 rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
      style={{left: `${left}px`, top: `${top}px`}}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">
          {thread ? 'Comment thread' : 'New comment'}
        </span>
        <IconButton label="Close popover" size="xs" onClick={onClose}>
          <IconX />
        </IconButton>
      </div>
      {content}
    </div>
  );
}
