import './TaskPage.css';

import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Loader,
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCalendar,
  IconCheck,
  IconCornerDownRight,
  IconFlag,
  IconMessageCircle,
  IconPencil,
  IconTrash,
  IconUser,
  IconX,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
} from '../../../shared/richtext.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {Surface} from '../../components/Surface/Surface.js';
import {TaskCommentEditor} from '../../components/TaskCommentEditor/TaskCommentEditor.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  addTaskComment,
  deleteTaskComment,
  editTaskComment,
  subscribeTask,
  subscribeTaskComments,
  subscribeTaskEvents,
  Task,
  TaskComment,
  TaskEvent,
  TaskMetadataField,
  TaskPriority,
  updateTaskDescription,
  updateTaskAssignee,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTargetLaunchDate,
} from '../../utils/tasks.js';

const TASK_STATUS_OPTIONS = [
  {value: 'open', label: 'Open'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'blocked', label: 'Blocked'},
  {value: 'done', label: 'Done'},
  {value: 'closed', label: 'Closed'},
];

const TASK_PRIORITY_OPTIONS = [
  {value: 'high', label: 'High'},
  {value: 'medium', label: 'Medium'},
  {value: 'normal', label: 'Normal'},
];

type TimelineItem =
  | {id: string; kind: 'opened'; createdAt?: Timestamp}
  | {id: string; kind: 'event'; event: TaskEvent; createdAt?: Timestamp}
  | {id: string; kind: 'comment'; comment: TaskComment; createdAt?: Timestamp};

/** Displays a task detail page with metadata, comments, and history. */
export function TaskPage(props: {id: string}) {
  const taskId = props.id;
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageTitle(task ? `Task: ${task.title}` : `Task: ${taskId}`);

  useEffect(() => {
    setLoading(true);
    setError('');
    const unsubscribers = [
      subscribeTask(
        taskId,
        (nextTask) => {
          setTask(nextTask);
          setLoading(false);
        },
        (err) => {
          setError(errorMessage(err));
          setLoading(false);
        }
      ),
      subscribeTaskComments(
        taskId,
        (nextComments) => setComments(nextComments),
        (err) => setError(errorMessage(err))
      ),
      subscribeTaskEvents(
        taskId,
        (nextEvents) => setEvents(nextEvents),
        (err) => setError(errorMessage(err))
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [taskId]);

  return (
    <Layout>
      <div className="TaskPage">
        <div className="TaskPage__header">
          <Breadcrumbs className="TaskPage__header__breadcrumbs">
            <a href="/cms">Tasks</a>
            <div>{taskId}</div>
          </Breadcrumbs>
          <div className="TaskPage__header__titleWrap">
            <Heading size="h1">{task ? task.title : `Task #${taskId}`}</Heading>
            {task && (
              <span
                className={joinClassNames(
                  'TaskPage__statusBadge',
                  `TaskPage__statusBadge--${formatClassSuffix(task.status)}`
                )}
              >
                {formatTaskStatus(task.status)}
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div className="TaskPage__loading">
            <Loader color="gray" size="xl" />
          </div>
        )}
        {!loading && error && <div className="TaskPage__error">{error}</div>}
        {!loading && !error && !task && (
          <Surface className="TaskPage__notFound">Task not found.</Surface>
        )}
        {!loading && !error && task && (
          <div className="TaskPage__body">
            <main className="TaskPage__main">
              <TaskDescription task={task} />
              <TaskTimeline task={task} comments={comments} events={events} />
              <TaskCommentComposer taskId={task.id} />
            </main>
            <aside className="TaskPage__side">
              <TaskMetadataPanel task={task} />
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}

/** Renders the editable task description. */
function TaskDescription(props: {task: Task}) {
  const {task} = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(task.description || '');
    }
  }, [task.description, editing]);

  async function saveDescription() {
    setSaving(true);
    try {
      await updateTaskDescription(task.id, draft.trim());
      setEditing(false);
    } catch (err) {
      showNotification({
        title: 'Could not update description',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="TaskPage__description">
      <div className="TaskPage__description__top">
        <div className="TaskPage__description__label">Description</div>
        {!editing && (
          <ActionIcon size="sm" onClick={() => setEditing(true)}>
            <IconPencil size={16} strokeWidth="1.8" />
          </ActionIcon>
        )}
      </div>
      {editing ? (
        <div className="TaskPage__description__edit">
          <Textarea
            autosize
            autoFocus
            minRows={4}
            value={draft}
            placeholder="Add task details, scope, and acceptance criteria."
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setDraft(e.currentTarget.value)
            }
          />
          <div className="TaskPage__description__editActions">
            <Button
              compact
              size="xs"
              variant="default"
              leftIcon={<IconX size={14} strokeWidth="1.8" />}
              onClick={() => {
                setEditing(false);
                setDraft(task.description || '');
              }}
            >
              Cancel
            </Button>
            <Button
              compact
              size="xs"
              color="dark"
              loading={saving}
              leftIcon={<IconCheck size={14} strokeWidth="1.8" />}
              onClick={saveDescription}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={joinClassNames(
            'TaskPage__description__content',
            !task.description && 'TaskPage__description__content--empty'
          )}
        >
          {task.description || 'No description provided.'}
        </div>
      )}
    </Surface>
  );
}

/** Renders editable task metadata and writes changes to history. */
function TaskMetadataPanel(props: {task: Task}) {
  const {task} = props;
  const [assignee, setAssignee] = useState(task.assignee || '');
  const [targetLaunchDate, setTargetLaunchDate] = useState(
    formatDateInputValue(task.targetLaunchDate)
  );
  const [savingField, setSavingField] = useState<TaskMetadataField | ''>('');

  useEffect(() => {
    setAssignee(task.assignee || '');
    setTargetLaunchDate(formatDateInputValue(task.targetLaunchDate));
  }, [task.assignee, task.targetLaunchDate]);

  async function saveMetadata(
    field: TaskMetadataField,
    update: () => Promise<void>
  ) {
    setSavingField(field);
    try {
      await update();
    } catch (err) {
      showNotification({
        title: 'Could not update task',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSavingField('');
    }
  }

  function saveAssignee() {
    const normalizedAssignee = assignee.trim();
    if ((task.assignee || '') === normalizedAssignee) {
      return;
    }
    saveMetadata('assignee', () =>
      updateTaskAssignee(task.id, normalizedAssignee || null)
    );
  }

  function saveTargetLaunchDate(value: string) {
    setTargetLaunchDate(value);
    if (formatDateInputValue(task.targetLaunchDate) === value) {
      return;
    }
    saveMetadata('targetLaunchDate', () =>
      updateTaskTargetLaunchDate(task.id, parseTargetLaunchDate(value))
    );
  }

  return (
    <Surface className="TaskPage__metadata">
      <div className="TaskPage__metadata__field">
        <label>Status</label>
        <Select
          size="xs"
          data={TASK_STATUS_OPTIONS}
          value={task.status || 'open'}
          onChange={(value: string | null) => {
            if (value && value !== (task.status || 'open')) {
              saveMetadata('status', () => updateTaskStatus(task.id, value));
            }
          }}
        />
      </div>
      <div className="TaskPage__metadata__field">
        <label>Assignee</label>
        <div className="TaskPage__metadata__assignee">
          <TextInput
            size="xs"
            type="email"
            placeholder="teammate@example.com"
            value={assignee}
            disabled={savingField === 'assignee'}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setAssignee(e.currentTarget.value)
            }
            onBlur={() => saveAssignee()}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      </div>
      <div className="TaskPage__metadata__field">
        <label>Priority</label>
        <Select
          size="xs"
          data={TASK_PRIORITY_OPTIONS}
          value={task.priority || 'normal'}
          onChange={(value: string | null) => {
            if (value && value !== (task.priority || 'normal')) {
              saveMetadata('priority', () =>
                updateTaskPriority(task.id, value as TaskPriority)
              );
            }
          }}
        />
      </div>
      <div className="TaskPage__metadata__field">
        <label>Target launch date</label>
        <div className="TaskPage__metadata__date">
          <input
            type="date"
            value={targetLaunchDate}
            disabled={savingField === 'targetLaunchDate'}
            onInput={(e) =>
              saveTargetLaunchDate((e.currentTarget as HTMLInputElement).value)
            }
          />
        </div>
      </div>
    </Surface>
  );
}

/** Combines task comments and metadata changes into a single timeline. */
function TaskTimeline(props: {
  task: Task;
  comments: TaskComment[];
  events: TaskEvent[];
}) {
  const {task, comments, events} = props;
  const repliesByParentId = useMemo(() => {
    const replies = new Map<string, TaskComment[]>();
    comments
      .filter((comment) => comment.parentId)
      .forEach((comment) => {
        const parentId = comment.parentId || '';
        replies.set(parentId, [...(replies.get(parentId) || []), comment]);
      });
    replies.forEach((parentReplies) =>
      parentReplies.sort(
        (a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
      )
    );
    return replies;
  }, [comments]);

  const items = useMemo<TimelineItem[]>(() => {
    const rootComments = comments.filter((comment) => !comment.parentId);
    const timelineItems: TimelineItem[] = [
      {id: 'opened', kind: 'opened', createdAt: task.createdAt},
      ...events.map((event) => ({
        id: event.id,
        kind: 'event' as const,
        event,
        createdAt: event.createdAt,
      })),
      ...rootComments.map((comment) => ({
        id: comment.id,
        kind: 'comment' as const,
        comment,
        createdAt: comment.createdAt,
      })),
    ];
    return timelineItems.sort(
      (a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
    );
  }, [task, comments, events]);

  return (
    <div className="TaskPage__timeline">
      {items.map((item) => {
        if (item.kind === 'opened') {
          return <TaskOpenedTimelineItem key={item.id} task={task} />;
        }
        if (item.kind === 'event') {
          return <TaskEventTimelineItem key={item.id} event={item.event} />;
        }
        return (
          <TaskCommentCard
            key={item.id}
            comment={item.comment}
            replies={repliesByParentId.get(item.comment.id) || []}
            threadParentId={item.comment.id}
          />
        );
      })}
    </div>
  );
}

/** Renders the opening event for a task. */
function TaskOpenedTimelineItem(props: {task: Task}) {
  const {task} = props;
  return (
    <div className="TaskPage__timelineItem TaskPage__timelineItem--event">
      <div className="TaskPage__timelineItem__marker">
        <IconCheck size={15} strokeWidth="2" />
      </div>
      <div className="TaskPage__timelineItem__content">
        <b>{formatTaskUser(task.createdBy || 'unknown')}</b> opened this task{' '}
        {formatTaskDateTime(task.createdAt)}.
      </div>
    </div>
  );
}

/** Renders one metadata mutation as a GitHub-style timeline event. */
function TaskEventTimelineItem(props: {event: TaskEvent}) {
  const {event} = props;
  return (
    <div className="TaskPage__timelineItem TaskPage__timelineItem--event">
      <div className="TaskPage__timelineItem__marker">
        {event.field === 'assignee' ? (
          <IconUser size={15} strokeWidth="2" />
        ) : event.field === 'priority' ? (
          <IconFlag size={15} strokeWidth="2" />
        ) : event.field === 'targetLaunchDate' ? (
          <IconCalendar size={15} strokeWidth="2" />
        ) : (
          <IconCheck size={15} strokeWidth="2" />
        )}
      </div>
      <div className="TaskPage__timelineItem__content">
        <b>{formatTaskUser(event.createdBy || 'unknown')}</b> changed{' '}
        {formatTaskField(event.field)} from{' '}
        <span className="TaskPage__timelineValue">
          {formatTaskEventValue(event.field, event.oldValue)}
        </span>{' '}
        to{' '}
        <span className="TaskPage__timelineValue">
          {formatTaskEventValue(event.field, event.newValue)}
        </span>{' '}
        {formatTaskDateTime(event.createdAt)}.
      </div>
    </div>
  );
}

/** Displays a task comment with optional one-level replies. */
function TaskCommentCard(props: {
  comment: TaskComment;
  replies?: TaskComment[];
  isReply?: boolean;
  threadParentId?: string;
}) {
  const {comment} = props;
  const currentUserEmail = window.firebase.user.email || '';
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState<RichTextData | null>(
    comment.body || richTextFromPlainText(comment.content)
  );
  const [saving, setSaving] = useState(false);
  const canModify =
    comment.createdBy === currentUserEmail && !comment.isDeleted;
  const replyParentId = props.threadParentId || comment.parentId || comment.id;

  useEffect(() => {
    setEditBody(comment.body || richTextFromPlainText(comment.content));
  }, [comment.body, comment.content]);

  async function onEdit() {
    if (!editBody) {
      return;
    }
    setSaving(true);
    try {
      await editTaskComment(comment.taskId, comment.id, editBody);
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
      await deleteTaskComment(comment.taskId, comment.id);
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
        'TaskPage__timelineItem',
        'TaskPage__timelineItem--comment',
        props.isReply && 'TaskPage__timelineItem--reply'
      )}
    >
      <div className="TaskPage__timelineItem__marker">
        {props.isReply ? (
          <IconCornerDownRight size={15} strokeWidth="2" />
        ) : (
          <IconMessageCircle size={15} strokeWidth="2" />
        )}
      </div>
      <div className="TaskPage__timelineItem__content">
        <Surface className="TaskPage__comment">
          <div className="TaskPage__comment__header">
            <div>
              <b>{formatTaskUser(comment.createdBy || 'unknown')}</b>{' '}
              <span>{formatTaskDateTime(comment.createdAt)}</span>
              {comment.updatedAt && !comment.isDeleted && (
                <span> edited {formatTaskDateTime(comment.updatedAt)}</span>
              )}
            </div>
            <div className="TaskPage__comment__actions">
              {!comment.isDeleted && (
                <Tooltip label="Reply">
                  <ActionIcon size="sm" onClick={() => setReplying(!replying)}>
                    <IconCornerDownRight size={16} strokeWidth="1.8" />
                  </ActionIcon>
                </Tooltip>
              )}
              {canModify && (
                <Tooltip label="Edit">
                  <ActionIcon size="sm" onClick={() => setEditing(true)}>
                    <IconPencil size={16} strokeWidth="1.8" />
                  </ActionIcon>
                </Tooltip>
              )}
              {canModify && (
                <Tooltip label="Delete">
                  <ActionIcon size="sm" onClick={onDelete}>
                    <IconTrash size={16} strokeWidth="1.8" />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          </div>
          {editing ? (
            <div className="TaskPage__comment__edit">
              <TaskCommentEditor
                value={editBody}
                placeholder="Edit this comment..."
                onChange={setEditBody}
              />
              <div className="TaskPage__comment__editActions">
                <Button
                  compact
                  size="xs"
                  variant="default"
                  leftIcon={<IconX size={14} strokeWidth="1.8" />}
                  onClick={() => {
                    setEditing(false);
                    setEditBody(
                      comment.body || richTextFromPlainText(comment.content)
                    );
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
                  leftIcon={<IconCheck size={14} strokeWidth="1.8" />}
                  onClick={onEdit}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={joinClassNames(
                'TaskPage__comment__body',
                comment.isDeleted && 'TaskPage__comment__body--deleted'
              )}
            >
              {comment.isDeleted ? (
                'Comment deleted.'
              ) : comment.body ? (
                <TaskRichText
                  className="TaskPage__comment__richText"
                  data={comment.body}
                />
              ) : (
                <Markdown
                  className="TaskPage__comment__markdown"
                  code={comment.content}
                />
              )}
            </div>
          )}
        </Surface>
        {replying && (
          <TaskCommentComposer
            taskId={comment.taskId}
            parentId={replyParentId}
            autoFocus
            onSubmitted={() => setReplying(false)}
            onCancel={() => setReplying(false)}
          />
        )}
        {props.replies && props.replies.length > 0 && (
          <div className="TaskPage__replies">
            {props.replies.map((reply) => (
              <TaskCommentCard
                key={reply.id}
                comment={reply}
                isReply
                threadParentId={comment.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Provides a composer for new top-level comments and replies. */
function TaskCommentComposer(props: {
  taskId: string;
  parentId?: string;
  autoFocus?: boolean;
  onSubmitted?: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState<RichTextData | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const isReply = Boolean(props.parentId);

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (!body) {
      return;
    }
    setSubmitting(true);
    try {
      await addTaskComment(props.taskId, body, props.parentId);
      setBody(null);
      setEditorKey((value) => value + 1);
      props.onSubmitted?.();
    } catch (err) {
      showNotification({
        title: isReply ? 'Could not add reply' : 'Could not add comment',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Surface
      className={joinClassNames(
        'TaskPage__composer',
        isReply && 'TaskPage__composer--reply'
      )}
    >
      <form onSubmit={onSubmit}>
        <TaskCommentEditor
          key={editorKey}
          autoFocus={props.autoFocus}
          placeholder={isReply ? 'Write a reply...' : 'Leave a comment...'}
          value={body}
          onChange={setBody}
        />
        <div className="TaskPage__composer__actions">
          {props.onCancel && (
            <Button
              compact
              size="xs"
              variant="default"
              type="button"
              onClick={props.onCancel}
            >
              Cancel
            </Button>
          )}
          <Button
            compact
            size="xs"
            color="dark"
            type="submit"
            loading={submitting}
            disabled={!body}
          >
            {isReply ? 'Reply' : 'Comment'}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function TaskRichText(props: {className?: string; data: RichTextData}) {
  return (
    <div className={props.className}>
      {(props.data.blocks || []).map((block, index) => (
        <TaskRichTextBlock key={index} block={block} />
      ))}
    </div>
  );
}

function TaskRichTextBlock(props: {block: RichTextBlock}) {
  const {block} = props;
  switch (block.type) {
    case 'paragraph':
      return <TaskRichTextHtml tag="p" html={block.data?.text} />;
    case 'heading':
      return <TaskRichTextHtml tag="h4" html={block.data?.text} />;
    case 'quote':
      return <TaskRichTextHtml tag="blockquote" html={block.data?.text} />;
    case 'orderedList':
      return (
        <ol>
          {(block.data?.items || []).map(
            (item: RichTextListItem, index: number) => (
              <TaskRichTextListItem key={index} item={item} />
            )
          )}
        </ol>
      );
    case 'unorderedList':
      return (
        <ul>
          {(block.data?.items || []).map(
            (item: RichTextListItem, index: number) => (
              <TaskRichTextListItem key={index} item={item} />
            )
          )}
        </ul>
      );
    case 'image': {
      const image = block.data?.file;
      if (!image?.url) {
        return null;
      }
      return (
        <img
          src={image.url}
          width={Number(image.width) || undefined}
          height={Number(image.height) || undefined}
          alt={image.alt || ''}
        />
      );
    }
    default:
      return null;
  }
}

function TaskRichTextHtml(props: {
  tag: 'p' | 'h4' | 'blockquote';
  html?: string;
}) {
  if (!props.html) {
    return null;
  }
  const Component = props.tag;
  return <Component dangerouslySetInnerHTML={{__html: props.html}} />;
}

function TaskRichTextListItem(props: {item: RichTextListItem}) {
  return (
    <li>
      {props.item.content && (
        <span dangerouslySetInnerHTML={{__html: props.item.content}} />
      )}
      {props.item.items && props.item.items.length > 0 && (
        <ul>
          {props.item.items.map((item, index) => (
            <TaskRichTextListItem key={index} item={item} />
          ))}
        </ul>
      )}
    </li>
  );
}

function richTextFromPlainText(value: string): RichTextData | null {
  if (!value.trim()) {
    return null;
  }
  return {
    blocks: value.split(/\n{2,}/).map((text) => ({
      type: 'paragraph',
      data: {text: escapeHtml(text).replace(/\n/g, '<br>')},
    })),
    time: Date.now(),
    version: 'plain-text',
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timestampMillis(ts?: Timestamp) {
  return ts?.toMillis?.() || 0;
}

function formatTaskUser(email: string) {
  return email.split('@')[0] || email;
}

function formatTaskDate(ts?: Timestamp | null) {
  if (!ts?.toMillis) {
    return 'No date';
  }
  return new Date(ts.toMillis()).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTaskDateTime(ts?: Timestamp | null) {
  if (!ts?.toMillis) {
    return 'just now';
  }
  return new Date(ts.toMillis()).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTaskStatus(status?: string) {
  return (status || 'open').replace(/[-_]/g, ' ');
}

function formatTaskField(field: TaskMetadataField) {
  return field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function formatTaskEventValue(
  field: TaskMetadataField,
  value: string | Timestamp | null
) {
  if (!value) {
    return 'none';
  }
  if (value instanceof Timestamp) {
    return formatTaskDate(value);
  }
  if (field === 'assignee') {
    return formatTaskUser(value);
  }
  return value.replace(/[-_]/g, ' ');
}

function formatClassSuffix(value?: string) {
  return (value || 'open').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function formatDateInputValue(value?: Timestamp | null) {
  if (!value?.toMillis) {
    return '';
  }
  const date = new Date(value.toMillis());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTargetLaunchDate(value: string) {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}
