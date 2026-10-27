import './TaskPage.css';

import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Loader,
  Menu,
  Popover,
  Switch,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconCirclePlus,
  IconDots,
  IconFile,
  IconFlag,
  IconLink,
  IconPaperclip,
  IconPencil,
  IconTrash,
  IconUser,
  IconUsers,
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
import {MentionSuggestionsContext} from '../../components/RichTextEditor/lexical/plugins/MentionsPlugin.js';
import {Surface} from '../../components/Surface/Surface.js';
import {
  TaskPriorityBadge,
  TaskStatusRing,
} from '../../components/TaskManager/TaskManager.js';
import {
  formatTaskTargetLaunchRelative,
  parseTaskTargetLaunchDraft,
  TaskTargetLaunchDraft,
  TaskTargetLaunchLabel,
  TaskTargetLaunchPicker,
  toTaskTargetLaunchDraft,
} from '../../components/TaskTargetLaunch/TaskTargetLaunch.js';
import {Text} from '../../components/Text/Text.js';
import {
  UserAvatar,
  UserAvatarGroup,
} from '../../components/UserAvatar/UserAvatar.js';
import {UserSelect} from '../../components/UserSelect/UserSelect.js';
import {UserTag} from '../../components/UserTag/UserTag.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
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
  formatTaskTargetLaunch,
  getTaskTargetLaunch,
  isOpenTaskStatus,
  isTaskTargetLaunchPast,
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
  toTaskTargetLaunch,
  updateTaskTitle,
  updateTaskCcList,
  updateTaskDescription,
  updateTaskAssignee,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTargetLaunch,
} from '../../utils/tasks.js';

const TASK_STATUS_OPTIONS = [
  {value: 'new', label: 'New'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'in-review', label: 'In review'},
  {value: 'closed', label: 'Closed'},
];

const TASK_PRIORITY_OPTIONS: TaskPriority[] = ['high', 'medium', 'normal'];

/** Minimum run of back-to-back task changes that collapses into one row. */
const MIN_ACTIVITY_GROUP_SIZE = 3;

type ActivityItem =
  | {id: string; kind: 'opened'; createdAt?: Timestamp}
  | {id: string; kind: 'event'; event: TaskEvent; createdAt?: Timestamp};

type TimelineItem =
  | ActivityItem
  | {id: string; kind: 'comment'; comment: TaskComment; createdAt?: Timestamp};

type TimelineEntry =
  | {id: string; kind: 'item'; item: TimelineItem}
  | {id: string; kind: 'group'; items: ActivityItem[]};

/** Displays a task detail page with metadata, comments, and history. */
export function TaskPage(props: {id: string}) {
  const taskId = props.id;
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Renders the description, comments, and comment editors in monospace.
  const [monoText, setMonoText] = useLocalStorage(
    'root-cms-task-page-monospace',
    false
  );

  usePageTitle(task ? `Task: ${task.title}` : `Task: ${taskId}`);

  // Suggest the task's participants in `@mention` autocomplete, since they
  // may not be project members (e.g. cc'd external users).
  const participants = useMemo(() => {
    if (!task) {
      return [];
    }
    return [
      task.createdBy,
      task.assignee || '',
      ...(task.cc || []),
      ...comments.map((comment) => comment.createdBy),
    ].filter(Boolean);
  }, [task, comments]);

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
      <div className={joinClassNames('TaskPage', monoText && 'TaskPage--mono')}>
        <header className="TaskPage__header">
          <Breadcrumbs className="TaskPage__header__breadcrumbs">
            <a href="/cms/tasks">Tasks</a>
            <div>#{taskId}</div>
          </Breadcrumbs>
          <div className="TaskPage__header__titleRow">
            <TaskTitle task={task} taskId={taskId} />
            {task && <TaskActionsMenu task={task} />}
          </div>
          {task && (
            <div className="TaskPage__header__meta">
              Opened by <UserTag email={task.createdBy || 'unknown'} /> on{' '}
              {formatTaskDate(task.createdAt)}
              {task.updatedAt && (
                <> · Updated {formatTaskDateTime(task.updatedAt)}</>
              )}
            </div>
          )}
        </header>

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
            <MentionSuggestionsContext.Provider value={participants}>
              <div className="TaskPage__body">
                <main className="TaskPage__main">
                  <TaskDescription task={task} />
                  <TaskAttachments task={task} />
                  <h2 className="TaskPage__sectionHeader__title TaskPage__activityHeading">
                    Activity
                  </h2>
                  <TaskTimeline
                    task={task}
                    comments={comments}
                    events={events}
                  />
                  <div className="TaskPage__composer">
                    <TaskCommentComposer taskId={task.id} />
                  </div>
                </main>
                <aside className="TaskPage__side">
                  <TaskMetadataPanel task={task} />
                  <Switch
                    className="TaskPage__monoToggle"
                    size="xs"
                    color="dark"
                    label="Monospace font"
                    checked={monoText}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setMonoText(e.currentTarget.checked)
                    }
                  />
                </aside>
              </div>
            </MentionSuggestionsContext.Provider>
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

/** Overflow menu in the page header for copying a link or deleting a task. */
function TaskActionsMenu(props: {task: Task}) {
  const {task} = props;
  const {route} = useLocation();
  const modals = useModals();
  const modalTheme = useModalTheme();

  async function copyLink() {
    const url = `${window.location.origin}/cms/tasks/${task.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotification({message: 'Link copied.'});
    } catch (err) {
      showNotification({
        title: 'Could not copy link',
        message: errorMessage(err),
        color: 'red',
      });
    }
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

  return (
    <Menu
      className="TaskPage__header__menu"
      position="bottom"
      placement="end"
      shadow="md"
      control={
        <ActionIcon variant="default" size="md" title="More actions">
          <IconDots size={16} strokeWidth="1.8" />
        </ActionIcon>
      }
    >
      <Menu.Item icon={<IconLink size={14} />} onClick={copyLink}>
        Copy link
      </Menu.Item>
      {!task.deleted && (
        <Menu.Item
          color="red"
          icon={<IconTrash size={14} />}
          onClick={onDeleteTask}
        >
          Delete task
        </Menu.Item>
      )}
    </Menu>
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
      <div className="TaskPage__sectionHeader">
        <h2 className="TaskPage__sectionHeader__title">Description</h2>
        {!editing && (
          <Tooltip label="Edit description">
            <ActionIcon size="sm" onClick={() => setEditing(true)}>
              <IconPencil size={16} strokeWidth="1.8" />
            </ActionIcon>
          </Tooltip>
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

  const attachButton = (
    <>
      <TaskAttachFilesButton
        uploading={uploading}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        className="TaskPage__fileInput"
        type="file"
        multiple
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          uploadFiles(e.currentTarget.files || []);
        }}
      />
    </>
  );

  // Without any files, only the upload button is shown.
  if (attachments.length === 0) {
    return (
      <div className="TaskPage__attachments TaskPage__attachments--empty">
        {attachButton}
      </div>
    );
  }

  return (
    <section className="TaskPage__attachments">
      <div className="TaskPage__sectionHeader">
        <h2 className="TaskPage__sectionHeader__title">
          Attachments
          <span className="TaskPage__sectionHeader__count">
            {attachments.length}
          </span>
        </h2>
        {attachButton}
      </div>
      <div className="TaskPage__files">
        {attachments.map((attachment) => (
          <TaskAttachmentTile
            key={attachment.id}
            attachment={attachment}
            showAttachedBy
            removing={removingAttachmentId === attachment.id}
            onRemove={() => removeAttachment(attachment)}
          />
        ))}
      </div>
    </section>
  );
}

/** Text-link style button for uploading files. */
function TaskAttachFilesButton(props: {
  uploading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="TaskPage__textButton TaskPage__attachButton"
      disabled={props.uploading}
      onClick={props.onClick}
    >
      <IconPaperclip size={14} strokeWidth="1.8" />
      {props.uploading ? 'Uploading…' : 'Attach files'}
    </button>
  );
}

/**
 * Compact file tile (thumbnail, name, and size) used for both task-level and
 * comment attachments.
 */
function TaskAttachmentTile(props: {
  attachment: TaskAttachment;
  /** Adds the uploader's name to the meta line. */
  showAttachedBy?: boolean;
  /** Shows a remove button when provided. */
  onRemove?: () => void;
  removing?: boolean;
}) {
  const {attachment} = props;
  const name = formatTaskAttachmentName(attachment);
  const size = formatFileSize(attachment.size);
  return (
    <div className="TaskPage__file">
      <a
        className="TaskPage__file__link"
        href={attachment.src}
        target="_blank"
        rel="noreferrer"
        title={name}
      >
        <span className="TaskPage__file__thumb">
          {isImageAttachment(attachment) ? (
            <img src={attachment.src} alt="" loading="lazy" />
          ) : (
            <IconFile size={16} strokeWidth="1.8" />
          )}
        </span>
        <span className="TaskPage__file__text">
          <span className="TaskPage__file__name">{name}</span>
          <span className="TaskPage__file__meta">
            {size || 'File'}
            {props.showAttachedBy && attachment.attachedBy && (
              <>
                {' · '}
                <UserTag email={attachment.attachedBy} />
              </>
            )}
          </span>
        </span>
      </a>
      {props.onRemove && (
        <Tooltip label="Remove attachment">
          <ActionIcon
            className="TaskPage__file__remove"
            size="sm"
            disabled={props.removing}
            onClick={props.onRemove}
          >
            <IconX size={14} strokeWidth="1.8" />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}

/** Renders a labeled field in the task details sidebar. */
function TaskDetail(props: {
  label: string;
  /** Optional shortcut shown next to the label, e.g. "Assign me". */
  action?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div className="TaskPage__detail">
      <div className="TaskPage__detail__label">
        <span>{props.label}</span>
        {props.action}
      </div>
      <div className="TaskPage__detail__value">{props.children}</div>
    </div>
  );
}

/** Renders editable task metadata and writes changes to history. */
function TaskMetadataPanel(props: {task: Task}) {
  const {task} = props;
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [ccPopoverOpen, setCcPopoverOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  // Edits are held as a draft and saved when the popover closes, since the
  // date and time inputs fire a change for every segment typed.
  const [dateDraft, setDateDraft] = useState<TaskTargetLaunchDraft>(() =>
    toTaskTargetLaunchDraft(null)
  );
  const [savingField, setSavingField] = useState<TaskMetadataField | ''>('');
  const ccList = task.cc || [];
  const status = normalizeTaskStatus(task.status);
  const priority = task.priority || 'normal';
  const targetLaunch = getTaskTargetLaunch(task);
  const targetLaunchOverdue =
    isOpenTaskStatus(status) && isTaskTargetLaunchPast(targetLaunch);
  const targetLaunchHint = formatTaskTargetLaunchRelative(targetLaunch, {
    overdue: targetLaunchOverdue,
  });
  const currentUserEmail = (window.firebase.user.email || '').toLowerCase();
  const isAssignedToMe =
    (task.assignee || '').toLowerCase() === currentUserEmail;
  const isCcdToMe = ccList.some(
    (email) => email.toLowerCase() === currentUserEmail
  );

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

  function saveStatus(value: string) {
    if (value !== status) {
      saveMetadata('status', () => updateTaskStatus(task.id, value));
    }
  }

  function savePriority(value: TaskPriority) {
    if (value !== priority) {
      saveMetadata('priority', () => updateTaskPriority(task.id, value));
    }
  }

  function saveAssignee(value: string) {
    const normalizedAssignee = value.trim().toLowerCase();
    if ((task.assignee || '').toLowerCase() === normalizedAssignee) {
      return;
    }
    saveMetadata('assignee', () =>
      updateTaskAssignee(task.id, normalizedAssignee || null)
    );
  }

  function saveCcList(emails: string[]) {
    const normalizedCc = normalizeTaskCcList(emails);
    if (normalizeTaskCcList(ccList).join(',') === normalizedCc.join(',')) {
      return;
    }
    saveMetadata('cc', () => updateTaskCcList(task.id, normalizedCc));
  }

  function saveTargetLaunch(draft: TaskTargetLaunchDraft | null) {
    const value = draft ? parseTaskTargetLaunchDraft(draft) : null;
    if (
      value?.type === targetLaunch?.type &&
      value?.date?.getTime() === targetLaunch?.date?.toMillis()
    ) {
      return;
    }
    saveMetadata('targetLaunchDate', () =>
      updateTaskTargetLaunch(task.id, value)
    );
  }

  function openDatePopover() {
    setDateDraft(toTaskTargetLaunchDraft(targetLaunch));
    setDatePopoverOpen(true);
  }

  /**
   * Closes the date popover and saves the draft. An incomplete draft (e.g. a
   * partially typed date/time) is ignored, so only "Clear" removes the date.
   */
  function closeDatePopover(options?: {clear?: boolean}) {
    setDatePopoverOpen(false);
    if (options?.clear) {
      saveTargetLaunch(null);
    } else if (parseTaskTargetLaunchDraft(dateDraft)) {
      saveTargetLaunch(dateDraft);
    }
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

  const statusLabel =
    TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ||
    formatTaskStatus(status);

  return (
    <div className="TaskPage__details">
      <TaskDetail label="Status">
        <Menu
          position="bottom"
          placement="start"
          shadow="md"
          control={
            <button
              type="button"
              className="TaskPage__detail__button"
              disabled={savingField === 'status'}
            >
              <TaskStatusRing status={status} />
              <span>{statusLabel}</span>
              <IconChevronDown
                className="TaskPage__detail__chevron"
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          {TASK_STATUS_OPTIONS.map((option) => (
            <Menu.Item
              key={option.value}
              icon={<TaskStatusRing status={option.value} />}
              className={joinClassNames(
                option.value === status && 'TaskPage__menuItem--active'
              )}
              onClick={() => saveStatus(option.value)}
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu>
      </TaskDetail>

      <TaskDetail
        label="Assignee"
        action={
          currentUserEmail &&
          !isAssignedToMe && (
            <button
              type="button"
              className="TaskPage__textButton"
              disabled={savingField === 'assignee'}
              onClick={() => saveAssignee(currentUserEmail)}
            >
              Assign me
            </button>
          )
        }
      >
        <Popover
          opened={assigneePopoverOpen}
          onClose={() => setAssigneePopoverOpen(false)}
          position="bottom"
          placement="start"
          shadow="md"
          width={280}
          withArrow
          target={
            <button
              type="button"
              className={joinClassNames(
                'TaskPage__detail__button',
                !task.assignee && 'TaskPage__detail__button--empty'
              )}
              aria-expanded={assigneePopoverOpen}
              disabled={savingField === 'assignee'}
              onClick={() => setAssigneePopoverOpen(!assigneePopoverOpen)}
            >
              {task.assignee ? (
                <>
                  <UserAvatar
                    email={task.assignee}
                    size={20}
                    withTooltip={false}
                  />
                  <UserTag email={task.assignee} />
                </>
              ) : (
                <span>Unassigned</span>
              )}
              <IconChevronDown
                className="TaskPage__detail__chevron"
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          <UserSelect
            autoFocus
            initiallyOpened
            value={task.assignee || ''}
            onChange={(email: string) => {
              saveAssignee(email);
              setAssigneePopoverOpen(false);
            }}
          />
        </Popover>
      </TaskDetail>

      <TaskDetail label="Priority">
        <Menu
          position="bottom"
          placement="start"
          shadow="md"
          control={
            <button
              type="button"
              className="TaskPage__detail__button"
              disabled={savingField === 'priority'}
            >
              <TaskPriorityBadge priority={priority} />
              <IconChevronDown
                className="TaskPage__detail__chevron"
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          {TASK_PRIORITY_OPTIONS.map((option) => (
            <Menu.Item
              key={option}
              className={joinClassNames(
                option === priority && 'TaskPage__menuItem--active'
              )}
              onClick={() => savePriority(option)}
            >
              <TaskPriorityBadge priority={option} />
            </Menu.Item>
          ))}
        </Menu>
      </TaskDetail>

      <TaskDetail label="Target launch">
        <Popover
          opened={datePopoverOpen}
          onClose={() => closeDatePopover()}
          position="bottom"
          placement="start"
          shadow="md"
          width={300}
          withArrow
          target={
            <button
              type="button"
              className={joinClassNames(
                'TaskPage__detail__button',
                !targetLaunch && 'TaskPage__detail__button--empty'
              )}
              aria-expanded={datePopoverOpen}
              disabled={savingField === 'targetLaunchDate'}
              onClick={() =>
                datePopoverOpen ? closeDatePopover() : openDatePopover()
              }
            >
              <span className="TaskPage__targetLaunch">
                {targetLaunch ? (
                  <TaskTargetLaunchLabel
                    launch={targetLaunch}
                    overdue={targetLaunchOverdue}
                    withIcon
                  />
                ) : (
                  'No date'
                )}
                {targetLaunchHint && (
                  <span
                    className={joinClassNames(
                      'TaskPage__targetLaunch__hint',
                      targetLaunchOverdue &&
                        'TaskPage__targetLaunch__hint--overdue'
                    )}
                  >
                    {targetLaunchHint}
                  </span>
                )}
              </span>
              <IconChevronDown
                className="TaskPage__detail__chevron"
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          <TaskTargetLaunchPicker
            value={dateDraft}
            onChange={setDateDraft}
            onClear={() => closeDatePopover({clear: true})}
            onDone={() => closeDatePopover()}
          />
        </Popover>
      </TaskDetail>

      <TaskDetail
        label="CC"
        action={
          currentUserEmail &&
          !isCcdToMe && (
            <button
              type="button"
              className="TaskPage__textButton"
              disabled={savingField === 'cc'}
              onClick={() => saveCcList([...ccList, currentUserEmail])}
            >
              CC me
            </button>
          )
        }
      >
        {ccList.length > 0 && (
          <div className="TaskPage__ccList" onCopy={handleCopyCc}>
            {ccList.map((email) => (
              <span
                className="TaskPage__ccChip"
                key={email}
                data-user-email={email}
              >
                <UserAvatar email={email} size={18} withTooltip={false} />
                <UserTag email={email} />
                <button
                  type="button"
                  className="TaskPage__ccChip__remove"
                  aria-label={`Remove ${email} from cc`}
                  disabled={savingField === 'cc'}
                  onClick={() =>
                    saveCcList(ccList.filter((cc) => cc !== email))
                  }
                >
                  <IconX size={12} strokeWidth="2" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Popover
          opened={ccPopoverOpen}
          onClose={() => setCcPopoverOpen(false)}
          position="bottom"
          placement="start"
          shadow="md"
          width={280}
          withArrow
          target={
            <button
              type="button"
              className="TaskPage__textButton TaskPage__addPeople"
              aria-expanded={ccPopoverOpen}
              disabled={savingField === 'cc'}
              onClick={() => setCcPopoverOpen(!ccPopoverOpen)}
            >
              + Add people
            </button>
          }
        >
          <UserSelect
            autoFocus
            initiallyOpened
            value=""
            onChange={(email: string) => {
              if (email) {
                saveCcList([...ccList, email]);
              }
              setCcPopoverOpen(false);
            }}
          />
        </Popover>
      </TaskDetail>
    </div>
  );
}

/**
 * Combines task comments and metadata changes into a single timeline. Runs of
 * back-to-back changes collapse into one expandable row so they don't bury
 * the comments.
 */
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

  const entries = useMemo<TimelineEntry[]>(() => {
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
    timelineItems.sort(
      (a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
    );
    return groupTimelineItems(timelineItems);
  }, [task, comments, events]);

  return (
    <ol className="TaskPage__timeline">
      {entries.map((entry) => {
        if (entry.kind === 'group') {
          return (
            <li key={entry.id}>
              <TaskActivityGroup task={task} items={entry.items} />
            </li>
          );
        }
        const item = entry.item;
        if (item.kind === 'comment') {
          return (
            <li key={entry.id}>
              <TaskCommentThread
                comment={item.comment}
                replies={repliesByParentId.get(item.comment.id) || []}
                commentNumbers={commentNumbers}
              />
            </li>
          );
        }
        return (
          <li key={entry.id}>
            <TaskActivityRow task={task} item={item} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Collapses runs of at least `MIN_ACTIVITY_GROUP_SIZE` consecutive changes
 * into groups. Comments are never grouped and break up a run.
 */
function groupTimelineItems(items: TimelineItem[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let run: ActivityItem[] = [];
  const flush = () => {
    if (run.length >= MIN_ACTIVITY_GROUP_SIZE) {
      entries.push({id: `group-${run[0].id}`, kind: 'group', items: run});
    } else {
      run.forEach((item) => entries.push({id: item.id, kind: 'item', item}));
    }
    run = [];
  };
  items.forEach((item) => {
    if (item.kind === 'comment') {
      flush();
      entries.push({id: item.id, kind: 'item', item});
    } else {
      run.push(item);
    }
  });
  flush();
  return entries;
}

/** Renders a collapsed summary of several changes, expandable to show all. */
function TaskActivityGroup(props: {task: Task; items: ActivityItem[]}) {
  const {task, items} = props;
  const [expanded, setExpanded] = useState(false);
  const opened = items.some((item) => item.kind === 'opened');
  const eventItems = items.filter((item) => item.kind === 'event');
  const actors = uniqueEmails(
    items.map((item) => getActivityActor(task, item))
  );
  const eventActors = uniqueEmails(
    eventItems.map((item) => getActivityActor(task, item))
  );
  const creator = task.createdBy || 'unknown';
  const changes = pluralize(eventItems.length, 'change');
  const firstDate = formatTaskDate(items[0].createdAt);
  const lastDate = formatTaskDate(items[items.length - 1].createdAt);

  let summary: ComponentChildren;
  if (!opened) {
    summary = (
      <>
        <TaskUserList emails={eventActors} /> made {changes}
      </>
    );
  } else if (eventActors.length === 1 && eventActors[0] === creator) {
    summary = (
      <>
        <UserTag email={creator} /> opened this task and made {changes}
      </>
    );
  } else {
    summary = (
      <>
        <UserTag email={creator} /> opened this task, and{' '}
        <TaskUserList emails={eventActors} /> made {changes}
      </>
    );
  }

  return (
    <div className="TaskPage__activityGroup">
      <button
        type="button"
        className="TaskPage__activityGroup__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <UserAvatarGroup
          className="TaskPage__activityGroup__avatars"
          emails={actors}
          size={18}
          max={3}
        />
        <span className="TaskPage__activityGroup__text">
          {summary} ·{' '}
          {firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`}
        </span>
        <span className="TaskPage__activityGroup__toggle">
          {expanded ? 'Hide' : 'Show all'}
          <IconChevronDown
            className={joinClassNames(
              'TaskPage__activityGroup__chevron',
              expanded && 'TaskPage__activityGroup__chevron--open'
            )}
            size={12}
            strokeWidth="2"
          />
        </span>
      </button>
      {expanded && (
        <ol className="TaskPage__activityGroup__items">
          {items.map((item) => (
            <li key={item.id}>
              <TaskActivityRow task={task} item={item} showTime />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Renders a single "opened" or metadata change row in the timeline. */
function TaskActivityRow(props: {
  task: Task;
  item: ActivityItem;
  /** Shows the time along with the date, used inside expanded groups. */
  showTime?: boolean;
}) {
  const {task, item} = props;
  const actor = getActivityActor(task, item);
  const when = props.showTime
    ? formatTaskDateTime(item.createdAt)
    : formatTaskDate(item.createdAt);
  return (
    <div className="TaskPage__activity">
      <span className="TaskPage__activity__icon">
        <TaskActivityIcon item={item} />
      </span>
      <span className="TaskPage__activity__text">
        <b>
          <UserTag email={actor} />
        </b>{' '}
        {item.kind === 'opened' ? (
          'opened this task'
        ) : item.event.field === 'cc' ? (
          <TaskCcEventSummary event={item.event} />
        ) : (
          <>
            changed {formatTaskField(item.event.field)} from{' '}
            <span className="TaskPage__activity__value">
              {formatTaskEventValue(item.event, 'old')}
            </span>{' '}
            to{' '}
            <span className="TaskPage__activity__value">
              {formatTaskEventValue(item.event, 'new')}
            </span>
          </>
        )}{' '}
        · {when}
      </span>
    </div>
  );
}

/** Returns the icon for an activity row based on what changed. */
function TaskActivityIcon(props: {item: ActivityItem}) {
  const {item} = props;
  if (item.kind === 'opened') {
    return <IconCirclePlus size={14} strokeWidth="1.8" />;
  }
  switch (item.event.field) {
    case 'status':
      return (
        <TaskStatusRing
          status={normalizeTaskStatus(
            typeof item.event.newValue === 'string'
              ? item.event.newValue
              : undefined
          )}
        />
      );
    case 'title':
      return <IconPencil size={14} strokeWidth="1.8" />;
    case 'assignee':
      return <IconUser size={14} strokeWidth="1.8" />;
    case 'cc':
      return <IconUsers size={14} strokeWidth="1.8" />;
    case 'priority':
      return <IconFlag size={14} strokeWidth="1.8" />;
    case 'targetLaunchDate':
      return <IconCalendar size={14} strokeWidth="1.8" />;
    default:
      return <IconCheck size={14} strokeWidth="1.8" />;
  }
}

/** Renders "A", "A and B", or "A, B, and N others". */
function TaskUserList(props: {emails: string[]}) {
  const [first, second, ...rest] = props.emails;
  if (!first) {
    return null;
  }
  if (!second) {
    return <UserTag email={first} />;
  }
  if (rest.length === 0) {
    return (
      <>
        <UserTag email={first} /> and <UserTag email={second} />
      </>
    );
  }
  return (
    <>
      <UserTag email={first} />, <UserTag email={second} />, and{' '}
      {pluralize(rest.length, 'other')}
    </>
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
        <b>
          <UserTag email={email} />
        </b>
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
      <span className="TaskPage__activity__value">
        {formatTaskEventValue(event, 'old')}
      </span>{' '}
      to{' '}
      <span className="TaskPage__activity__value">
        {formatTaskEventValue(event, 'new')}
      </span>
    </>
  );
}

/**
 * Displays a top-level comment and its replies in one card, with each reply
 * as a row separated by a divider.
 */
function TaskCommentThread(props: {
  comment: TaskComment;
  replies: TaskComment[];
  commentNumbers: Map<string, number>;
}) {
  const {comment} = props;
  const [replying, setReplying] = useState(false);
  return (
    <Surface className="TaskPage__thread">
      <TaskCommentRow
        comment={comment}
        commentNumbers={props.commentNumbers}
        onReply={comment.isDeleted ? undefined : () => setReplying(true)}
      />
      {props.replies.map((reply) => (
        <TaskCommentRow
          key={reply.id}
          comment={reply}
          commentNumbers={props.commentNumbers}
        />
      ))}
      {replying && (
        <div className="TaskPage__thread__reply">
          <TaskCommentComposer
            taskId={comment.taskId}
            parentId={comment.id}
            autoFocus
            onSubmitted={() => setReplying(false)}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </Surface>
  );
}

/** Displays one comment (or reply) row with edit and delete controls. */
function TaskCommentRow(props: {
  comment: TaskComment;
  commentNumbers: Map<string, number>;
  /** Shows a "Reply" button when provided (top-level comments only). */
  onReply?: () => void;
}) {
  const {comment} = props;
  const commentNumber = props.commentNumbers.get(comment.id);
  const anchorId = commentNumber ? `comment-${commentNumber}` : undefined;
  const currentUserEmail = window.firebase.user.email || '';
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState<RichTextData | null>(
    comment.body || richTextFromPlainText(comment.content)
  );
  const [saving, setSaving] = useState(false);
  const canModify =
    comment.createdBy === currentUserEmail && !comment.isDeleted;
  const attachments = comment.attachments || [];

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
    <div id={anchorId} className="TaskPage__comment">
      <UserAvatar email={comment.createdBy} size={28} />
      <div className="TaskPage__comment__main">
        <div className="TaskPage__comment__header">
          <div className="TaskPage__comment__byline">
            <b>
              <UserTag email={comment.createdBy || 'unknown'} />
            </b>
            {anchorId ? (
              <a className="TaskPage__comment__timestamp" href={`#${anchorId}`}>
                {formatTaskDateTime(comment.createdAt)}
              </a>
            ) : (
              <span>{formatTaskDateTime(comment.createdAt)}</span>
            )}
            {comment.updatedAt && !comment.isDeleted && <span>(edited)</span>}
          </div>
          <div className="TaskPage__comment__actions">
            {canModify && !editing && (
              <Tooltip label="Edit">
                <ActionIcon size="sm" onClick={() => setEditing(true)}>
                  <IconPencil size={14} strokeWidth="1.8" />
                </ActionIcon>
              </Tooltip>
            )}
            {canModify && !editing && (
              <Tooltip label="Delete">
                <ActionIcon size="sm" onClick={onDelete}>
                  <IconTrash size={14} strokeWidth="1.8" />
                </ActionIcon>
              </Tooltip>
            )}
            {props.onReply && (
              <button
                type="button"
                className="TaskPage__textButton"
                onClick={props.onReply}
              >
                Reply
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <div className="TaskPage__comment__edit TaskPage__composerForm">
            <CommentEditor
              variant="minimal"
              value={editBody}
              placeholder="Edit this comment..."
              onChange={setEditBody}
              onSubmitShortcut={onEdit}
            />
            <div className="TaskPage__composer__actions">
              <Button
                className="TaskPage__composer__button"
                size="xs"
                radius={6}
                variant="default"
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
                className="TaskPage__composer__button"
                size="xs"
                radius={6}
                color="dark"
                loading={saving}
                disabled={!editBody}
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
            {!comment.isDeleted && attachments.length > 0 && (
              <div className="TaskPage__files TaskPage__files--comment">
                {attachments.map((attachment) => (
                  <TaskAttachmentTile
                    key={attachment.id}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
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
    <form className="TaskPage__composerForm" onSubmit={onSubmit}>
      <CommentEditor
        key={editorKey}
        variant="minimal"
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
            <div className="TaskPage__composer__attachment" key={attachment.id}>
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
        <TaskAttachFilesButton
          uploading={uploading}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          className="TaskPage__fileInput"
          type="file"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            uploadFiles(Array.from(e.currentTarget.files || []));
          }}
        />
        <div className="TaskPage__composer__actions__spacer" />
        {props.onCancel && (
          <Button
            className="TaskPage__composer__button"
            size="xs"
            radius={6}
            variant="default"
            type="button"
            onClick={props.onCancel}
          >
            Cancel
          </Button>
        )}
        <Tooltip label="Cmd+Enter to submit" withArrow>
          <Button
            className="TaskPage__composer__button"
            size="xs"
            radius={6}
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
  );
}

function getActivityActor(task: Task, item: ActivityItem) {
  if (item.kind === 'opened') {
    return task.createdBy || 'unknown';
  }
  return item.event.createdBy || 'unknown';
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails));
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
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
  if (field === 'targetLaunchDate') {
    return 'target launch';
  }
  return field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function formatTaskEventValue(event: TaskEvent, which: 'old' | 'new') {
  const field = event.field;
  const value = which === 'old' ? event.oldValue : event.newValue;
  if (field === 'targetLaunchDate') {
    const launch = toTaskTargetLaunch(
      which === 'old' ? event.oldTargetLaunchType : event.newTargetLaunchType,
      value instanceof Timestamp ? value : null
    );
    return launch ? formatTaskTargetLaunch(launch) : 'none';
  }
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
