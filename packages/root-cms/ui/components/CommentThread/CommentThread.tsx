import './CommentThread.css';

import {ActionIcon, Button, Loader, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconArrowBackUp,
  IconCheck,
  IconMessage,
  IconPencil,
  IconSend2,
  IconTrash,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  CommentTimestamp,
  FieldComment,
  FieldCommentThread,
  isOpenThread,
} from '../../../shared/comments.js';
import {RichTextData} from '../../../shared/richtext.js';
import {useFieldComments} from '../../hooks/useFieldComments.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  addFieldComment,
  deleteFieldComment,
  editFieldComment,
  reopenFieldCommentThread,
  resolveFieldCommentThread,
} from '../../utils/comments.js';
import {errorMessage} from '../../utils/notifications.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';
import {CommentBody} from '../CommentBody/CommentBody.js';
import {CommentEditor} from '../CommentEditor/CommentEditor.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {UserTag} from '../UserTag/UserTag.js';

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
  className?: string;
}

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

  const fieldLabel = (
    <>
      <IconMessage size={14} strokeWidth="1.8" />
      <span className="CommentThread__field__label">{props.fieldLabel}</span>
    </>
  );

  return (
    <div
      className={joinClassNames(
        'CommentThread',
        !isOpen && 'CommentThread--resolved',
        props.className
      )}
    >
      <div className="CommentThread__header">
        {props.onNavigate ? (
          <button
            type="button"
            className="CommentThread__field CommentThread__field--link"
            onClick={props.onNavigate}
            title="Go to field"
          >
            {fieldLabel}
          </button>
        ) : (
          <div className="CommentThread__field">{fieldLabel}</div>
        )}
        <div className="CommentThread__header__actions">
          {!isOpen && <span className="CommentThread__status">Resolved</span>}
          {thread && canComment && (
            <Tooltip
              label={isOpen ? 'Mark as resolved' : 'Reopen thread'}
              withArrow
            >
              <ActionIcon
                size="sm"
                className="CommentThread__statusButton"
                onClick={toggleStatus}
                loading={statusPending}
                aria-label={isOpen ? 'Mark as resolved' : 'Reopen thread'}
              >
                {isOpen ? (
                  <IconCheck size={16} strokeWidth="2" />
                ) : (
                  <IconArrowBackUp size={16} strokeWidth="1.8" />
                )}
              </ActionIcon>
            </Tooltip>
          )}
          {props.headerActions}
        </div>
      </div>
      {thread && thread.comments.length > 0 && (
        <div className="CommentThread__entries">
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
      {canComment ? (
        <CommentThreadComposer
          docId={props.docId}
          fieldKey={props.fieldKey}
          fieldLabel={props.fieldLabel}
          placeholder={
            isOpen ? 'Comment or @mention someone…' : 'Reply to reopen…'
          }
          autoFocus={props.autoFocus}
          onSubmitted={props.onCommentAdded}
        />
      ) : (
        !thread && (
          <div className="CommentThread__readOnly">
            You don't have permission to comment on this doc.
          </div>
        )
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
    <div className="CommentThread__composer">
      <CommentEditor
        key={editorKey}
        variant="minimal"
        placeholder={props.placeholder}
        value={body}
        onChange={setBody}
        autoFocus={props.autoFocus}
        onSubmitShortcut={submit}
      />
      <div className="CommentThread__composer__actions">
        <Tooltip label="Comment (⌘ + Enter)" withArrow>
          <ActionIcon
            variant="filled"
            color="dark"
            radius="xl"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="Add comment"
          >
            {submitting ? (
              <Loader size={14} color="white" />
            ) : (
              <IconSend2 size={16} />
            )}
          </ActionIcon>
        </Tooltip>
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
      className={joinClassNames(
        'CommentThread__comment',
        comment.deleted && 'CommentThread__comment--deleted'
      )}
    >
      <div className="CommentThread__comment__avatar">
        <UserAvatar email={comment.createdBy} size={24} />
      </div>
      <div className="CommentThread__comment__main">
        <div className="CommentThread__comment__header">
          <span className="CommentThread__comment__author">
            <UserTag email={comment.createdBy || 'unknown'} />
          </span>
          <CommentTime
            className="CommentThread__comment__time"
            timestamp={comment.createdAt}
          />
          {comment.updatedAt && !comment.deleted && (
            <span className="CommentThread__comment__edited">(edited)</span>
          )}
          {canModify && !editing && (
            <div className="CommentThread__comment__actions">
              <Tooltip label="Edit" withArrow>
                <ActionIcon
                  size="xs"
                  onClick={() => setEditing(true)}
                  aria-label="Edit comment"
                >
                  <IconPencil size={14} strokeWidth="1.8" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete" withArrow>
                <ActionIcon
                  size="xs"
                  onClick={onDelete}
                  aria-label="Delete comment"
                >
                  <IconTrash size={14} strokeWidth="1.8" />
                </ActionIcon>
              </Tooltip>
            </div>
          )}
        </div>
        {editing ? (
          <div className="CommentThread__comment__edit">
            <CommentEditor
              variant="minimal"
              value={editBody}
              placeholder="Edit this comment…"
              onChange={setEditBody}
              onSubmitShortcut={onSave}
              autoFocus
            />
            <div className="CommentThread__comment__editActions">
              <Button
                compact
                size="xs"
                variant="default"
                onClick={() => {
                  setEditing(false);
                  setEditBody(comment.body || null);
                }}
              >
                Cancel
              </Button>
              <Button
                compact
                size="xs"
                color="dark"
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
            className="CommentThread__comment__body"
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
    <div className="CommentThread__event">
      <span className="CommentThread__event__icon">
        {entry.type === 'resolved' ? (
          <IconCheck size={12} strokeWidth="2.5" />
        ) : (
          <IconArrowBackUp size={12} strokeWidth="2" />
        )}
      </span>
      <span>
        <UserTag email={entry.createdBy || 'unknown'} /> {verb} this thread
      </span>
      <CommentTime
        className="CommentThread__event__time"
        timestamp={entry.createdAt}
      />
    </div>
  );
}

function CommentTime(props: {
  timestamp?: CommentTimestamp;
  className?: string;
}) {
  const millis = props.timestamp?.toMillis?.();
  if (!millis) {
    return null;
  }
  return (
    <Tooltip label={formatDateTime(props.timestamp as any)} withArrow>
      <span className={props.className}>{getTimeAgo(millis)}</span>
    </Tooltip>
  );
}
