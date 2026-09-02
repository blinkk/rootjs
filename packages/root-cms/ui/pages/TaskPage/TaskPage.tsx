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
import {useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconCalendar,
  IconCheck,
  IconCornerDownRight,
  IconExternalLink,
  IconFlag,
  IconMessageCircle,
  IconPaperclip,
  IconPencil,
  IconTrash,
  IconUser,
  IconX,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {ComponentChildren} from 'preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  extractRichTextMentions,
  RichTextData,
} from '../../../shared/richtext.js';
import {
  CommentBody,
  richTextFromPlainText,
} from '../../components/CommentBody/CommentBody.js';
import {CommentEditor} from '../../components/CommentEditor/CommentEditor.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Surface} from '../../components/Surface/Surface.js';
import {Text} from '../../components/Text/Text.js';
import {
  UserMultiSelect,
  UserSelect,
} from '../../components/UserSelect/UserSelect.js';
import {UserTag} from '../../components/UserTag/UserTag.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  addTaskComment,
  addTaskAttachment,
  buildTaskAttachment,
  deleteTask,
  deleteTaskComment,
  editTaskComment,
  normalizeTaskCcList,
  normalizeTaskStatus,
  removeTaskAttachment,
  restoreTask,
  subscribeTask,
  subscribeTaskComments,
  subscribeTaskEvents,
  Task,
  TaskAttachment,
  TaskComment,
  TaskEvent,
  TaskMetadataField,
  TaskPriority,
  updateTaskTitle,
  updateTaskCcList,
  updateTaskDescription,
  updateTaskAssignee,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTargetLaunchDate,
} from '../../utils/tasks.js';

const TASK_STATUS_OPTIONS = [
  {value: 'new', label: 'New'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'in-review', label: 'In review'},
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
            <a href="/cms/tasks">Tasks</a>
            <div>{taskId}</div>
          </Breadcrumbs>
          <div className="TaskPage__header__titleWrap">
            <TaskTitle task={task} taskId={taskId} />
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
          <>
            {task.deleted && <TaskDeletedBanner task={task} />}
            <div className="TaskPage__body">
              <main className="TaskPage__main">
                <TaskDescription task={task} />
                <TaskAttachments task={task} />
                <TaskTimeline task={task} comments={comments} events={events} />
                <TaskCommentComposer taskId={task.id} />
              </main>
              <aside className="TaskPage__side">
                <TaskMetadataPanel task={task} />
              </aside>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

/** Banner shown when a task has been deleted, with an option to restore it. */
function TaskDeletedBanner(props: {task: Task}) {
  const {task} = props;
  const [restoring, setRestoring] = useState(false);

  async function onRestore() {
    setRestoring(true);
    try {
      await restoreTask(task.id);
    } catch (err) {
      showNotification({
        title: 'Could not restore task',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="TaskPage__deletedBanner">
      <div className="TaskPage__deletedBanner__text">
        This task was deleted
        {task.deletedBy && (
          <>
            {' '}
            by <UserTag email={task.deletedBy} />
          </>
        )}
        {task.deletedAt && <> {formatTaskDateTime(task.deletedAt)}</>}. It no
        longer appears in task lists.
      </div>
      <Button
        compact
        size="xs"
        variant="default"
        loading={restoring}
        onClick={onRestore}
      >
        Restore task
      </Button>
    </div>
  );
}

/** Renders the task title with inline editing. */
function TaskTitle(props: {task: Task | null; taskId: string}) {
  const {task} = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task?.title || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(task?.title || '');
    }
  }, [task?.title, editing]);

  async function saveTitle() {
    if (!task) {
      return;
    }
    const nextTitle = draft.trim();
    if (!nextTitle) {
      showNotification({
        title: 'Could not update title',
        message: 'Task title is required.',
        color: 'red',
      });
      return;
    }
    if (nextTitle === task.title) {
      setDraft(task.title);
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await updateTaskTitle(task.id, nextTitle);
      setEditing(false);
    } catch (err) {
      showNotification({
        title: 'Could not update title',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setSaving(false);
    }
  }

  if (!task) {
    return <Heading size="h1">{`Task #${props.taskId}`}</Heading>;
  }

  if (editing) {
    return (
      <form
        className="TaskPage__header__titleForm"
        onSubmit={(e) => {
          e.preventDefault();
          saveTitle();
        }}
      >
        <TextInput
          autoFocus
          className="TaskPage__header__titleInput"
          disabled={saving}
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setDraft(e.currentTarget.value)
          }
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              setDraft(task.title);
              setEditing(false);
            }
          }}
        />
        <Button
          compact
          size="xs"
          color="dark"
          type="submit"
          loading={saving}
          leftIcon={<IconCheck size={14} strokeWidth="1.8" />}
        >
          Save
        </Button>
        <Button
          compact
          size="xs"
          variant="default"
          type="button"
          leftIcon={<IconX size={14} strokeWidth="1.8" />}
          onClick={() => {
            setDraft(task.title);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="TaskPage__header__titleContent">
      <Heading size="h1">{task.title}</Heading>
      <Tooltip label="Edit title">
        <ActionIcon size="sm" onClick={() => setEditing(true)}>
          <IconPencil size={16} strokeWidth="1.8" />
        </ActionIcon>
      </Tooltip>
    </div>
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

/** Renders task attachment upload controls and the current attachment list. */
function TaskAttachments(props: {task: Task}) {
  const {task} = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState('');
  const attachments = task.attachments || [];

  async function uploadFiles(files: FileList | File[]) {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) {
      return;
    }

    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const uploadedFile = await uploadFileToGCS(file);
        await addTaskAttachment(task.id, {
          ...uploadedFile,
          filename: uploadedFile.filename || file.name,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
      showNotification({
        message:
          selectedFiles.length === 1
            ? 'File attached.'
            : `${selectedFiles.length} files attached.`,
        color: 'green',
      });
    } catch (err) {
      showNotification({
        title: 'Could not attach file',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  async function removeAttachment(attachment: TaskAttachment) {
    const name = formatTaskAttachmentName(attachment);
    if (!window.confirm(`Remove ${name} from this task?`)) {
      return;
    }
    setRemovingAttachmentId(attachment.id);
    try {
      await removeTaskAttachment(task.id, attachment.id);
    } catch (err) {
      showNotification({
        title: 'Could not remove attachment',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setRemovingAttachmentId('');
    }
  }

  return (
    <section className="TaskPage__attachments">
      <div className="TaskPage__attachments__top">
        <div className="TaskPage__attachments__label">Attachments</div>
        <Button
          compact
          size="xs"
          variant="subtle"
          type="button"
          loading={uploading}
          leftIcon={<IconPaperclip size={14} strokeWidth="1.8" />}
          onClick={() => inputRef.current?.click()}
        >
          Attach files
        </Button>
        <input
          ref={inputRef}
          className="TaskPage__attachments__input"
          type="file"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            uploadFiles(e.currentTarget.files || []);
          }}
        />
      </div>
      {attachments.length > 0 ? (
        <div className="TaskPage__attachments__list">
          {attachments.map((attachment) => (
            <div className="TaskPage__attachments__item" key={attachment.id}>
              <div className="TaskPage__attachments__itemIcon">
                <IconPaperclip size={16} strokeWidth="1.8" />
              </div>
              <div className="TaskPage__attachments__itemContent">
                <a
                  href={attachment.src}
                  target="_blank"
                  rel="noreferrer"
                  className="TaskPage__attachments__itemTitle"
                >
                  {formatTaskAttachmentName(attachment)}
                </a>
                <div className="TaskPage__attachments__itemMeta">
                  <TaskAttachmentMeta attachment={attachment} />
                </div>
              </div>
              <div className="TaskPage__attachments__itemActions">
                <Tooltip label="Open file">
                  <ActionIcon
                    component="a"
                    href={attachment.src}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                  >
                    <IconExternalLink size={16} strokeWidth="1.8" />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Remove attachment">
                  <ActionIcon
                    size="sm"
                    disabled={removingAttachmentId === attachment.id}
                    onClick={() => removeAttachment(attachment)}
                  >
                    <IconTrash size={16} strokeWidth="1.8" />
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="TaskPage__attachments__empty">No files attached.</div>
      )}
    </section>
  );
}

/** Renders editable task metadata and writes changes to history. */
function TaskMetadataPanel(props: {task: Task}) {
  const {task} = props;
  const {route} = useLocation();
  const modals = useModals();
  const modalTheme = useModalTheme();
  const [assignee, setAssignee] = useState(task.assignee || '');
  const [targetLaunchDate, setTargetLaunchDate] = useState(
    formatDateInputValue(task.targetLaunchDate)
  );
  const [savingField, setSavingField] = useState<TaskMetadataField | ''>('');
  const ccList = task.cc || [];
  const currentUserEmail = (window.firebase.user.email || '').toLowerCase();
  const isAssignedToMe =
    (task.assignee || '').toLowerCase() === currentUserEmail;
  const isCcdToMe = ccList.some(
    (email) => email.toLowerCase() === currentUserEmail
  );

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

  function saveAssignee(value: string) {
    const normalizedAssignee = value.trim().toLowerCase();
    setAssignee(normalizedAssignee);
    if ((task.assignee || '').toLowerCase() === normalizedAssignee) {
      return;
    }
    saveMetadata('assignee', () =>
      updateTaskAssignee(task.id, normalizedAssignee || null)
    );
  }

  function assignToMe() {
    if (!currentUserEmail || isAssignedToMe) {
      return;
    }
    saveAssignee(currentUserEmail);
  }

  function saveCcList(emails: string[]) {
    const normalizedCc = normalizeTaskCcList(emails);
    if (normalizeTaskCcList(ccList).join(',') === normalizedCc.join(',')) {
      return;
    }
    saveMetadata('cc', () => updateTaskCcList(task.id, normalizedCc));
  }

  function ccMe() {
    if (!currentUserEmail || isCcdToMe) {
      return;
    }
    saveCcList([...ccList, currentUserEmail]);
  }

  // Copies the full email addresses of the selected chips, instead of the
  // display names shown in the UI (e.g. "Jeremy" -> "jeremydw@example.com").
  function handleCopyCc(e: ClipboardEvent) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const container = e.currentTarget as HTMLElement;
    const emails = Array.from(
      container.querySelectorAll<HTMLElement>('[data-user-email]')
    )
      .filter((el) => selection.containsNode(el, true))
      .map((el) => el.dataset.userEmail || '')
      .filter(Boolean);
    if (emails.length === 0) {
      return;
    }
    e.preventDefault();
    e.clipboardData?.setData('text/plain', emails.join(', '));
  }

  function onDeleteTask() {
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Delete task #${task.id}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete "{task.title}"? The task will no
          longer appear in task lists.
        </Text>
      ),
      labels: {confirm: 'Delete task', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      closeOnConfirm: false,
      onConfirm: async () => {
        try {
          await deleteTask(task.id);
          modals.closeModal(modalId);
          route('/cms/tasks');
        } catch (err) {
          modals.closeModal(modalId);
          showNotification({
            title: 'Could not delete task',
            message: errorMessage(err),
            color: 'red',
            autoClose: false,
          });
        }
      },
    });
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
          value={normalizeTaskStatus(task.status)}
          onChange={(value: string | null) => {
            if (value && value !== normalizeTaskStatus(task.status)) {
              saveMetadata('status', () => updateTaskStatus(task.id, value));
            }
          }}
        />
      </div>
      <div className="TaskPage__metadata__field">
        <label>Assignee</label>
        <div className="TaskPage__metadata__assignee">
          <UserSelect
            value={assignee}
            disabled={savingField === 'assignee'}
            onChange={(email: string) => saveAssignee(email)}
          />
        </div>
        {currentUserEmail && !isAssignedToMe && (
          <button
            type="button"
            className="TaskPage__metadata__selfLink"
            disabled={savingField === 'assignee'}
            onClick={assignToMe}
          >
            Assign me
          </button>
        )}
      </div>
      <div className="TaskPage__metadata__field">
        <label>CC</label>
        <div className="TaskPage__metadata__cc" onCopy={handleCopyCc}>
          <UserMultiSelect
            value={ccList}
            disabled={savingField === 'cc'}
            onChange={(emails: string[]) => saveCcList(emails)}
          />
          {currentUserEmail && !isCcdToMe && (
            <button
              type="button"
              className="TaskPage__metadata__selfLink"
              disabled={savingField === 'cc'}
              onClick={ccMe}
            >
              CC me
            </button>
          )}
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
      {!task.deleted && (
        <div className="TaskPage__metadata__danger">
          <Button
            compact
            size="xs"
            variant="subtle"
            color="red"
            leftIcon={<IconTrash size={14} strokeWidth="1.8" />}
            onClick={onDeleteTask}
          >
            Delete task
          </Button>
        </div>
      )}
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
  // Assign stable 1-based numbers to comments (in createdAt order) for
  // deeplink anchors like `#comment-1`.
  const commentNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    [...comments]
      .sort(
        (a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
      )
      .forEach((comment, index) => {
        numbers.set(comment.id, index + 1);
      });
    return numbers;
  }, [comments]);

  // Scroll to the comment referenced by the URL hash once comments load.
  const didScrollToHashRef = useRef(false);
  useEffect(() => {
    if (didScrollToHashRef.current || comments.length === 0) {
      return;
    }
    const hash = window.location.hash;
    if (!/^#comment-\d+$/.test(hash)) {
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) {
      didScrollToHashRef.current = true;
      el.scrollIntoView({block: 'start'});
    }
  }, [comments]);

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
            commentNumbers={commentNumbers}
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
        <IconCheck size={13} strokeWidth="2" />
      </div>
      <div className="TaskPage__timelineItem__content">
        <b>
          <UserTag email={task.createdBy || 'unknown'} />
        </b>{' '}
        opened this task {formatTaskDateTime(task.createdAt)}.
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
        {event.field === 'title' ? (
          <IconPencil size={13} strokeWidth="2" />
        ) : event.field === 'assignee' ? (
          <IconUser size={13} strokeWidth="2" />
        ) : event.field === 'priority' ? (
          <IconFlag size={13} strokeWidth="2" />
        ) : event.field === 'targetLaunchDate' ? (
          <IconCalendar size={13} strokeWidth="2" />
        ) : (
          <IconCheck size={13} strokeWidth="2" />
        )}
      </div>
      <div className="TaskPage__timelineItem__content">
        <b>
          <UserTag email={event.createdBy || 'unknown'} />
        </b>{' '}
        {event.field === 'cc' ? (
          <TaskCcEventSummary event={event} />
        ) : (
          <>
            changed {formatTaskField(event.field)} from{' '}
            <span className="TaskPage__timelineValue">
              {formatTaskEventValue(event.field, event.oldValue)}
            </span>{' '}
            to{' '}
            <span className="TaskPage__timelineValue">
              {formatTaskEventValue(event.field, event.newValue)}
            </span>
          </>
        )}{' '}
        {formatTaskDateTime(event.createdAt)}.
      </div>
    </div>
  );
}

/** Renders a concise "added/removed X to/from cc" summary for a cc event. */
function TaskCcEventSummary(props: {event: TaskEvent}) {
  const {event} = props;
  const toEmails = (value: TaskEvent['oldValue']) =>
    typeof value === 'string' ? value.split(/,\s*/).filter(Boolean) : [];
  const oldEmails = toEmails(event.oldValue);
  const newEmails = toEmails(event.newValue);
  const added = newEmails.filter((email) => !oldEmails.includes(email));
  const removed = oldEmails.filter((email) => !newEmails.includes(email));
  const renderEmails = (emails: string[]) =>
    emails.map((email, index) => (
      <span key={email}>
        {index > 0 && ', '}
        <UserTag email={email} />
      </span>
    ));
  if (added.length > 0 && removed.length === 0) {
    return <>added {renderEmails(added)} to cc</>;
  }
  if (removed.length > 0 && added.length === 0) {
    return <>removed {renderEmails(removed)} from cc</>;
  }
  return (
    <>
      changed cc from{' '}
      <span className="TaskPage__timelineValue">
        {formatTaskEventValue(event.field, event.oldValue)}
      </span>{' '}
      to{' '}
      <span className="TaskPage__timelineValue">
        {formatTaskEventValue(event.field, event.newValue)}
      </span>
    </>
  );
}

/** Displays a task comment with optional one-level replies. */
function TaskCommentCard(props: {
  comment: TaskComment;
  replies?: TaskComment[];
  isReply?: boolean;
  threadParentId?: string;
  commentNumbers?: Map<string, number>;
}) {
  const {comment} = props;
  const commentNumber = props.commentNumbers?.get(comment.id);
  const anchorId = commentNumber ? `comment-${commentNumber}` : undefined;
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
      await editTaskComment(comment.taskId, comment.id, editBody, {
        mentions: extractRichTextMentions(editBody),
      });
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
      id={anchorId}
      className={joinClassNames(
        'TaskPage__timelineItem',
        'TaskPage__timelineItem--comment',
        props.isReply && 'TaskPage__timelineItem--reply'
      )}
    >
      <div className="TaskPage__timelineItem__marker">
        {props.isReply ? (
          <IconCornerDownRight size={13} strokeWidth="2" />
        ) : (
          <IconMessageCircle size={13} strokeWidth="2" />
        )}
      </div>
      <div className="TaskPage__timelineItem__content">
        <Surface className="TaskPage__comment">
          <div className="TaskPage__comment__header">
            <div>
              <b>
                <UserTag email={comment.createdBy || 'unknown'} />
              </b>{' '}
              {anchorId ? (
                <a
                  className="TaskPage__comment__timestamp"
                  href={`#${anchorId}`}
                >
                  {formatTaskDateTime(comment.createdAt)}
                </a>
              ) : (
                <span>{formatTaskDateTime(comment.createdAt)}</span>
              )}
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
              <CommentEditor
                value={editBody}
                placeholder="Edit this comment..."
                onChange={setEditBody}
                onSubmitShortcut={onEdit}
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
            <div className="TaskPage__comment__body">
              <CommentBody
                body={comment.body}
                content={comment.content}
                deleted={comment.isDeleted}
              />
              {!comment.isDeleted && (
                <TaskCommentAttachments
                  attachments={comment.attachments || []}
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
                commentNumbers={props.commentNumbers}
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
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isReply = Boolean(props.parentId);
  const canSubmit =
    Boolean(body || attachments.length > 0) && !submitting && !uploading;

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const uploadedFile = await uploadFileToGCS(file);
        const attachment = buildTaskAttachment({
          ...uploadedFile,
          filename: uploadedFile.filename || file.name,
          contentType: file.type || undefined,
          size: file.size,
        });
        setAttachments((current) => [...current, attachment]);
      }
    } catch (err) {
      showNotification({
        title: 'Could not attach file',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function submit() {
    if (!body && attachments.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      await addTaskComment(props.taskId, body, props.parentId, {
        attachments,
        mentions: extractRichTextMentions(body),
      });
      setBody(null);
      setAttachments([]);
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

  function onSubmit(e: Event) {
    e.preventDefault();
    submit();
  }

  return (
    <Surface
      className={joinClassNames(
        'TaskPage__composer',
        isReply && 'TaskPage__composer--reply'
      )}
    >
      <form onSubmit={onSubmit}>
        <CommentEditor
          key={editorKey}
          autoFocus={props.autoFocus}
          placeholder={isReply ? 'Write a reply...' : 'Leave a comment...'}
          value={body}
          onChange={setBody}
          onSubmitShortcut={submit}
          onPasteFiles={uploadFiles}
        />
        {attachments.length > 0 && (
          <div className="TaskPage__composer__attachments">
            {attachments.map((attachment) => (
              <div
                className="TaskPage__composer__attachment"
                key={attachment.id}
              >
                <IconPaperclip size={14} strokeWidth="1.8" />
                <span className="TaskPage__composer__attachment__name">
                  {formatTaskAttachmentName(attachment)}
                </span>
                <ActionIcon
                  size="xs"
                  title="Remove attachment"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((a) => a.id !== attachment.id)
                    )
                  }
                >
                  <IconX size={12} strokeWidth="1.8" />
                </ActionIcon>
              </div>
            ))}
          </div>
        )}
        <div className="TaskPage__composer__actions">
          <Button
            compact
            size="xs"
            variant="subtle"
            type="button"
            loading={uploading}
            leftIcon={<IconPaperclip size={14} strokeWidth="1.8" />}
            onClick={() => fileInputRef.current?.click()}
          >
            Attach
          </Button>
          <input
            ref={fileInputRef}
            className="TaskPage__composer__fileInput"
            type="file"
            multiple
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              uploadFiles(Array.from(e.currentTarget.files || []));
            }}
          />
          <div className="TaskPage__composer__actions__spacer" />
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
          <Tooltip label="Cmd+Enter to submit" withArrow>
            <Button
              compact
              size="xs"
              color="dark"
              type="submit"
              loading={submitting}
              disabled={!canSubmit}
            >
              {isReply ? 'Reply' : 'Comment'}
            </Button>
          </Tooltip>
        </div>
      </form>
    </Surface>
  );
}

/** Renders attachment chips nested within a comment. */
function TaskCommentAttachments(props: {attachments: TaskAttachment[]}) {
  const attachments = props.attachments;
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="TaskPage__comment__attachments">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          className="TaskPage__comment__attachment"
          href={attachment.src}
          target="_blank"
          rel="noreferrer"
        >
          {isImageAttachment(attachment) ? (
            <img
              className="TaskPage__comment__attachment__thumb"
              src={attachment.src}
              alt={formatTaskAttachmentName(attachment)}
            />
          ) : (
            <IconPaperclip size={14} strokeWidth="1.8" />
          )}
          <span className="TaskPage__comment__attachment__name">
            {formatTaskAttachmentName(attachment)}
          </span>
        </a>
      ))}
    </div>
  );
}

function isImageAttachment(attachment: TaskAttachment) {
  if (attachment.contentType?.startsWith('image/')) {
    return true;
  }
  const ext =
    attachment.src.split('?')[0].split('.').at(-1)?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext);
}

function timestampMillis(ts?: Timestamp) {
  return ts?.toMillis?.() || 0;
}

function formatTaskAttachmentName(attachment: TaskAttachment) {
  const urlFilename =
    attachment.src.split('?')[0].split('/').filter(Boolean).at(-1) || '';
  const filename = attachment.filename || urlFilename || 'Attachment';
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

/** Renders the meta line (size, type, uploader, date) for a task attachment. */
function TaskAttachmentMeta(props: {attachment: TaskAttachment}) {
  const {attachment} = props;
  const parts: ComponentChildren[] = [
    formatFileSize(attachment.size),
    attachment.contentType || '',
    attachment.attachedBy ? (
      <>
        attached by <UserTag email={attachment.attachedBy} />
      </>
    ) : (
      ''
    ),
    attachment.attachedAt ? formatTaskDateTime(attachment.attachedAt) : '',
  ].filter(Boolean);
  if (parts.length === 0) {
    return <>Attached file</>;
  }
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && ' - '}
          {part}
        </span>
      ))}
    </>
  );
}

function formatFileSize(size?: number) {
  if (typeof size !== 'number') {
    return '';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value = value / 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
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
  return normalizeTaskStatus(status).replace(/[-_]/g, ' ');
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
    return <UserTag email={value} />;
  }
  if (field === 'cc') {
    const emails = value.split(/,\s*/).filter(Boolean);
    return (
      <>
        {emails.map((email, index) => (
          <span key={email}>
            {index > 0 && ', '}
            <UserTag email={email} />
          </span>
        ))}
      </>
    );
  }
  if (field === 'title') {
    return value;
  }
  return value.replace(/[-_]/g, ' ');
}

function formatClassSuffix(value?: string) {
  return normalizeTaskStatus(value)
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
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
