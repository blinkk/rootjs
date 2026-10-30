import {
  IconArrowBackUp,
  IconCheck,
  IconMessageCircle,
  IconPencil,
  IconSend2,
  IconTrash,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  CommentTimestamp,
  FieldComment,
  FieldCommentThread,
  isOpenThread,
} from '../../../../shared/comments.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {RelativeTime} from '../../../components/RelativeTime/RelativeTime.js';
import {Badge} from '../../../primitives/Badge/Badge.js';
import {Button} from '../../../primitives/Button/Button.js';
import {IconButton} from '../../../primitives/IconButton/IconButton.js';
import {showNotification} from '../../../primitives/Toast/toastStore.js';
import {cn} from '../../../utils/classes.js';
import {errorMessage} from '../../../utils/notifications.js';
import {UserAvatar} from '../../users/UserAvatar/UserAvatar.js';
import {UserTag} from '../../users/UserTag/UserTag.js';
import {CommentBody} from '../CommentBody/CommentBody.js';
import {CommentEditor} from '../CommentEditor/CommentEditor.js';
import {
  addFieldComment,
  deleteFieldComment,
  editFieldComment,
  reopenFieldCommentThread,
  resolveFieldCommentThread,
} from '../comments.js';
import {openFieldCommentsPanel, useFieldComments} from '../useFieldComments.js';

export interface CommentThreadProps {
  docId: string;
  /** Deep key of the field the thread belongs to. */
  fieldKey: string;
  /** Display label for the field, e.g. `Sections › #2 › Title`. */
  fieldLabel: string;
  /** The thread, or `null` when the field has no comments yet. */
  thread?: FieldCommentThread | null;
  /** Focuses the composer on mount. */
  autoFocus?: boolean;
  /** Called when the field label is clicked (e.g. to scroll to the field). */
  onNavigate?: () => void;
  /** Extra controls rendered in the thread header. */
  headerActions?: ComponentChildren;
  /** Called after a comment is successfully added. */
  onCommentAdded?: () => void;
  /**
   * Called when the user wants to start a new thread on the field (shown on
   * resolved threads). When omitted, the comments panel is opened on the
   * field instead.
   */
  onStartNewThread?: () => void;
  /**
   * Number of resolved threads the field has. Shown as a link to the
   * comments panel when rendering a field without an open thread.
   */
  resolvedCount?: number;
  className?: string;
}

/** Classes shared by the field label, whether it's a link or plain text. */
const FIELD_CLASSES =
  'CommentThread__field flex min-w-0 items-center gap-1.5 text-left font-sans text-sm font-semibold text-fg';

/** Resets a native button so it reads as inline text. */
const TEXT_BUTTON_CLASSES =
  'm-0 cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Renders the comment thread for a single field: the field's comment history,
 * resolve/reopen controls, and a composer for adding a comment. Used both in
 * the field header popover and in the comments panel.
 */
export function CommentThread(props: CommentThreadProps) {
  const ctx = useFieldComments();
  const canComment = ctx?.canComment ?? false;
  const thread = props.thread || null;
  const isOpen = !thread || isOpenThread(thread);
  const [statusPending, setStatusPending] = useState(false);
  const entriesRef = useRef<HTMLDivElement>(null);
  const entryCount = thread?.comments.length || 0;

  // Long threads scroll within the popover, so start at the latest entry (and
  // follow along when a new one is appended).
  useEffect(() => {
    const el = entriesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entryCount]);

  async function toggleStatus() {
    if (!thread || statusPending) {
      return;
    }
    setStatusPending(true);
    try {
      if (isOpen) {
        await resolveFieldCommentThread(props.docId, thread.id);
      } else {
        await reopenFieldCommentThread(props.docId, thread.id);
      }
    } catch (err) {
      showNotification({
        title: isOpen ? 'Could not resolve thread' : 'Could not reopen thread',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setStatusPending(false);
    }
  }

  function startNewThread() {
    if (props.onStartNewThread) {
      props.onStartNewThread();
      return;
    }
    openFieldCommentsPanel({
      fieldKey: props.fieldKey,
      fieldLabel: props.fieldLabel,
    });
  }

  const fieldLabel = (
    <>
      <IconMessageCircle className="shrink-0" size={14} strokeWidth="1.8" />
      <span className="CommentThread__field__label truncate underline-offset-2 group-hover/field:underline">
        {props.fieldLabel}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        'CommentThread',
        !isOpen && 'CommentThread--resolved',
        'flex flex-col gap-2.5',
        props.className
      )}
    >
      <div className="CommentThread__header flex min-h-6 items-center justify-between gap-2">
        {props.onNavigate ? (
          <button
            type="button"
            className={cn(
              'CommentThread__field--link group/field',
              TEXT_BUTTON_CLASSES,
              FIELD_CLASSES
            )}
            onClick={props.onNavigate}
            title="Go to field"
          >
            {fieldLabel}
          </button>
        ) : (
          <div className={FIELD_CLASSES}>{fieldLabel}</div>
        )}
        <div className="CommentThread__header__actions flex shrink-0 items-center gap-1">
          {!isOpen && (
            <Badge className="CommentThread__status" tone="success">
              Resolved
            </Badge>
          )}
          {thread && canComment && (
            <IconButton
              size="xs"
              className="CommentThread__statusButton"
              onClick={toggleStatus}
              loading={statusPending}
              label={isOpen ? 'Mark as resolved' : 'Reopen thread'}
            >
              {isOpen ? (
                <IconCheck strokeWidth="2" />
              ) : (
                <IconArrowBackUp strokeWidth="1.8" />
              )}
            </IconButton>
          )}
          {props.headerActions}
        </div>
      </div>
      {thread && thread.comments.length > 0 && (
        <div
          className="CommentThread__entries flex flex-col gap-3"
          ref={entriesRef}
        >
          {thread.comments.map((entry) =>
            !entry.type || entry.type === 'comment' ? (
              <CommentThreadComment
                key={entry.id}
                docId={props.docId}
                threadId={thread.id}
                comment={entry}
              />
            ) : (
              <CommentThreadEvent key={entry.id} entry={entry} />
            )
          )}
        </div>
      )}
      {!isOpen ? (
        <div className="CommentThread__resolvedNote flex flex-col items-start gap-2 text-sm leading-normal text-muted">
          <span>
            This thread is resolved. Reopen it to continue the conversation, or
            start a new thread on the field.
          </span>
          {canComment && (
            <Button
              size="xs"
              icon={<IconMessageCircle strokeWidth="1.8" />}
              onClick={startNewThread}
            >
              New thread
            </Button>
          )}
        </div>
      ) : canComment ? (
        <CommentThreadComposer
          docId={props.docId}
          fieldKey={props.fieldKey}
          fieldLabel={props.fieldLabel}
          placeholder="Comment or @mention someone…"
          autoFocus={props.autoFocus}
          onSubmitted={props.onCommentAdded}
        />
      ) : (
        !thread && (
          <div className="CommentThread__readOnly text-sm text-muted">
            You don't have permission to comment on this doc.
          </div>
        )
      )}
      {!thread && (props.resolvedCount || 0) > 0 && (
        <button
          type="button"
          className={cn(
            'CommentThread__resolvedLink',
            TEXT_BUTTON_CLASSES,
            'self-start text-left font-sans text-sm text-muted underline underline-offset-2 hover:text-fg'
          )}
          onClick={() =>
            openFieldCommentsPanel({
              fieldKey: props.fieldKey,
              fieldLabel: props.fieldLabel,
            })
          }
        >
          {props.resolvedCount} resolved thread
          {props.resolvedCount === 1 ? '' : 's'} on this field
        </button>
      )}
    </div>
  );
}

interface CommentThreadComposerProps {
  docId: string;
  fieldKey: string;
  fieldLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitted?: () => void;
}

function CommentThreadComposer(props: CommentThreadComposerProps) {
  const [body, setBody] = useState<RichTextData | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = Boolean(body) && !submitting;

  async function submit() {
    if (!body || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await addFieldComment(props.docId, {
        fieldKey: props.fieldKey,
        fieldLabel: props.fieldLabel,
        body,
      });
      setBody(null);
      setEditorKey((value) => value + 1);
      props.onSubmitted?.();
    } catch (err) {
      showNotification({
        title: 'Could not add comment',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="CommentThread__composer flex flex-col gap-1.5">
      <CommentEditor
        key={editorKey}
        variant="minimal"
        placeholder={props.placeholder}
        value={body}
        onChange={setBody}
        autoFocus={props.autoFocus}
        onSubmitShortcut={submit}
      />
      <div className="CommentThread__composer__actions flex justify-end">
        <IconButton
          variant="primary"
          round
          onClick={submit}
          disabled={!canSubmit}
          loading={submitting}
          label="Add comment"
          tooltip="Comment (⌘ + Enter)"
        >
          <IconSend2 />
        </IconButton>
      </div>
    </div>
  );
}

interface CommentThreadCommentProps {
  docId: string;
  threadId: string;
  comment: FieldComment;
}

function CommentThreadComment(props: CommentThreadCommentProps) {
  const {comment} = props;
  const currentUserEmail = (window.firebase.user.email || '').toLowerCase();
  const canModify =
    comment.createdBy?.toLowerCase() === currentUserEmail && !comment.deleted;
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState<RichTextData | null>(
    comment.body || null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditBody(comment.body || null);
  }, [comment.body]);

  async function onSave() {
    if (!editBody) {
      return;
    }
    setSaving(true);
    try {
      await editFieldComment(props.docId, props.threadId, comment.id, editBody);
      setEditing(false);
    } catch (err) {
      showNotification({
        title: 'Could not edit comment',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this comment?')) {
      return;
    }
    try {
      await deleteFieldComment(props.docId, props.threadId, comment.id);
    } catch (err) {
      showNotification({
        title: 'Could not delete comment',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  return (
    <div
      className={cn(
        'CommentThread__comment',
        comment.deleted && 'CommentThread__comment--deleted',
        'group/comment flex gap-2'
      )}
    >
      <div className="CommentThread__comment__avatar shrink-0 pt-px">
        <UserAvatar email={comment.createdBy} size={24} />
      </div>
      <div className="CommentThread__comment__main flex min-w-0 flex-1 flex-col gap-1">
        <div className="CommentThread__comment__header flex min-h-5 flex-wrap items-center gap-1.5 text-sm text-muted">
          <span className="CommentThread__comment__author font-semibold text-fg">
            <UserTag email={comment.createdBy || 'unknown'} />
          </span>
          <CommentTime
            className="CommentThread__comment__time"
            timestamp={comment.createdAt}
          />
          {comment.updatedAt && !comment.deleted && (
            <span className="CommentThread__comment__edited text-xs">
              (edited)
            </span>
          )}
          {canModify && !editing && (
            // Revealed on hover and focus; always shown on touch screens.
            <div className="CommentThread__comment__actions ml-auto flex gap-0.5 opacity-0 transition-opacity group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 pointer-coarse:opacity-100">
              <IconButton
                size="xs"
                onClick={() => setEditing(true)}
                label="Edit comment"
                tooltip="Edit"
              >
                <IconPencil strokeWidth="1.8" />
              </IconButton>
              <IconButton
                size="xs"
                onClick={onDelete}
                label="Delete comment"
                tooltip="Delete"
              >
                <IconTrash strokeWidth="1.8" />
              </IconButton>
            </div>
          )}
        </div>
        {editing ? (
          <div className="CommentThread__comment__edit flex flex-col gap-2">
            <CommentEditor
              variant="minimal"
              value={editBody}
              placeholder="Edit this comment…"
              onChange={setEditBody}
              onSubmitShortcut={onSave}
              autoFocus
            />
            <div className="CommentThread__comment__editActions flex justify-end gap-1.5">
              <Button
                size="xs"
                onClick={() => {
                  setEditing(false);
                  setEditBody(comment.body || null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                variant="primary"
                loading={saving}
                disabled={!editBody}
                onClick={onSave}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody
            className="CommentThread__comment__body pr-3"
            body={comment.body}
            content={comment.content}
            deleted={comment.deleted}
          />
        )}
      </div>
    </div>
  );
}

function CommentThreadEvent(props: {entry: FieldComment}) {
  const {entry} = props;
  const verb = entry.type === 'resolved' ? 'resolved' : 'reopened';
  return (
    <div className="CommentThread__event flex items-center gap-1.5 pl-1 text-sm text-muted">
      <span className="CommentThread__event__icon inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-active *:size-3">
        {entry.type === 'resolved' ? (
          <IconCheck strokeWidth="2.5" />
        ) : (
          <IconArrowBackUp strokeWidth="2" />
        )}
      </span>
      <span>
        <UserTag email={entry.createdBy || 'unknown'} /> {verb} this thread
      </span>
      <CommentTime
        className="CommentThread__event__time ml-auto"
        timestamp={entry.createdAt}
      />
    </div>
  );
}

function CommentTime(props: {
  timestamp?: CommentTimestamp;
  className?: string;
}) {
  return <RelativeTime className={props.className} ts={props.timestamp} />;
}
