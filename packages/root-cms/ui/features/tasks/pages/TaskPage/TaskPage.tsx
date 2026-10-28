import './TaskPage.css';

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
} from '../../../../../shared/richtext.js';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {uploadFileToGCS} from '../../../../integrations/gcs.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Switch} from '../../../../primitives/Switch/Switch.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {
  CommentBody,
  richTextFromPlainText,
} from '../../../comments/CommentBody/CommentBody.js';
import {CommentEditor} from '../../../comments/CommentEditor/CommentEditor.js';
import {MentionSuggestionsContext} from '../../../documents/components/RichTextEditor/lexical/plugins/MentionsPlugin.js';
import {
  UserAvatar,
  UserAvatarGroup,
} from '../../../users/UserAvatar/UserAvatar.js';
import {UserSelect} from '../../../users/UserSelect/UserSelect.js';
import {UserTag} from '../../../users/UserTag/UserTag.js';
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
} from '../../tasks.js';

/** Section headings, e.g. "Description" and "Activity". */
const SECTION_TITLE_CLASSES =
  'TaskPage__sectionHeader__title m-0 flex items-center gap-1.5 text-base font-semibold';

/** The row holding a section heading and its actions. */
const SECTION_HEADER_CLASSES =
  'TaskPage__sectionHeader flex min-h-control-sm items-center justify-between gap-2';

/** Small text action, e.g. "Reply", "Assign me", "CC me". */
const TEXT_BUTTON_CLASSES =
  'TaskPage__textButton m-0 cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 font-sans text-sm font-medium text-strong underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:no-underline disabled:opacity-60';

/**
 * Hides a secondary action until its row (a `group`) is hovered, on devices
 * that can hover. Touch screens always show it.
 */
const REVEAL_ON_HOVER_CLASSES =
  'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100';

/** Borderless sidebar trigger that only shows a background on hover. */
const DETAIL_BUTTON_CLASSES =
  'TaskPage__detail__button group m-0 flex min-h-control-sm w-full cursor-pointer appearance-none items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left font-sans text-sm font-medium text-strong hover:bg-surface-hover aria-expanded:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent pointer-coarse:min-h-10';

/** Placeholder text in a sidebar trigger, e.g. "Unassigned". */
const DETAIL_BUTTON_EMPTY_CLASSES =
  'TaskPage__detail__button--empty font-normal text-muted';

const DETAIL_CHEVRON_CLASSES =
  'TaskPage__detail__chevron ml-auto shrink-0 text-subtle pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-aria-expanded:opacity-100';

/** An old or new value in an activity row. */
const ACTIVITY_VALUE_CLASSES =
  'TaskPage__activity__value rounded-sm bg-chip px-1 py-px font-medium';

/** The comment editor, attachments, and actions share one outlined box. */
const COMPOSER_FORM_CLASSES =
  'TaskPage__composerForm flex flex-col rounded-lg border border-solid border-border bg-surface transition-colors focus-within:border-border-strong';

const COMPOSER_ACTIONS_CLASSES =
  'TaskPage__composer__actions flex items-center justify-end gap-2 border-0 border-t border-solid border-border py-2 pl-2.5 pr-2';

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
      <div
        className={cn(
          'TaskPage',
          monoText && 'TaskPage--mono',
          'bg-page p-(--cms-page-padding-mobile) text-strong md:p-(--cms-page-padding)'
        )}
      >
        <header className="TaskPage__header mb-6 max-w-350 border-0 border-b border-solid border-border pb-5">
          <Breadcrumbs
            className="TaskPage__header__breadcrumbs mb-3"
            items={[
              {label: 'Tasks', href: '/cms/tasks'},
              {label: `#${taskId}`},
            ]}
          />
          <div className="TaskPage__header__titleRow flex items-start justify-between gap-4">
            <TaskTitle task={task} taskId={taskId} />
            {task && <TaskActionsMenu task={task} />}
          </div>
          {task && (
            <div className="TaskPage__header__meta mt-1.5 text-sm">
              Opened by{' '}
              <UserTag
                className="font-medium"
                email={task.createdBy || 'unknown'}
              />{' '}
              on {formatTaskDate(task.createdAt)}
              {task.updatedAt && (
                <> · Updated {formatTaskDateTime(task.updatedAt)}</>
              )}
            </div>
          )}
        </header>

        {loading && (
          <div className="TaskPage__loading flex min-h-35 items-center justify-center text-muted">
            <Spinner size="lg" />
          </div>
        )}
        {!loading && error && (
          <div className="TaskPage__error flex min-h-35 items-center justify-center text-base text-danger">
            {error}
          </div>
        )}
        {!loading && !error && !task && (
          <Surface className="TaskPage__notFound flex min-h-35 max-w-160 items-center justify-center">
            Task not found.
          </Surface>
        )}
        {!loading && !error && task && (
          <>
            {task.deleted && <TaskDeletedBanner task={task} />}
            <MentionSuggestionsContext.Provider value={participants}>
              <div className="TaskPage__body flex max-w-350 flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
                <main className="TaskPage__main flex min-w-0 flex-1 flex-col gap-5">
                  <TaskDescription task={task} />
                  <TaskAttachments task={task} />
                  <h2
                    className={cn(
                      SECTION_TITLE_CLASSES,
                      'TaskPage__activityHeading mt-3'
                    )}
                  >
                    Activity
                  </h2>
                  <TaskTimeline
                    task={task}
                    comments={comments}
                    events={events}
                  />
                  <div className="TaskPage__composer mt-1">
                    <TaskCommentComposer taskId={task.id} />
                  </div>
                </main>
                {/*
                 * The page element is itself the scroll container, so the
                 * sticky sidebar pins below the page's own top padding.
                 */}
                <aside className="TaskPage__side order-first min-w-0 lg:sticky lg:top-0 lg:order-none lg:w-70 lg:shrink-0">
                  <TaskMetadataPanel task={task} />
                  <Switch
                    className="TaskPage__monoToggle border-0 border-t border-solid border-border pt-4"
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
    <div
      className="TaskPage__deletedBanner mb-4 flex max-w-350 flex-wrap items-center justify-between gap-3 rounded-lg border border-solid border-danger-line bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
      role="status"
    >
      <div className="TaskPage__deletedBanner__text min-w-0">
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
      <Button size="xs" loading={restoring} onClick={onRestore}>
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
        className="TaskPage__header__titleForm flex min-w-0 max-w-240 flex-1 flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveTitle();
        }}
      >
        <TextInput
          autoFocus
          aria-label="Task title"
          className="TaskPage__header__titleInput min-w-0 basis-full sm:flex-1 sm:basis-56"
          inputClassName="text-xl font-bold"
          size="md"
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
          size="xs"
          variant="primary"
          type="submit"
          loading={saving}
          icon={<IconCheck strokeWidth="1.8" />}
        >
          Save
        </Button>
        <Button
          size="xs"
          type="button"
          icon={<IconX strokeWidth="1.8" />}
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
    <div className="TaskPage__header__titleContent flex min-w-0 items-center gap-1.5">
      <Heading size="h1" className="wrap-anywhere">
        {task.title}
      </Heading>
      <IconButton
        className="shrink-0"
        label="Edit title"
        size="xs"
        onClick={() => setEditing(true)}
      >
        <IconPencil strokeWidth="1.8" />
      </IconButton>
    </div>
  );
}

/** Overflow menu in the page header for copying a link or deleting a task. */
function TaskActionsMenu(props: {task: Task}) {
  const {task} = props;
  const {route} = useLocation();
  const modals = useModals();

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
      placement="bottom-end"
      trigger={
        <IconButton
          className="TaskPage__header__menu shrink-0"
          label="More actions"
          variant="default"
        >
          <IconDots strokeWidth="1.8" />
        </IconButton>
      }
    >
      <MenuItem icon={<IconLink />} onClick={copyLink}>
        Copy link
      </MenuItem>
      {!task.deleted && (
        <MenuItem danger icon={<IconTrash />} onClick={onDeleteTask}>
          Delete task
        </MenuItem>
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
    <Surface className="TaskPage__description pb-4 pl-5 pr-4 pt-3">
      <div className={SECTION_HEADER_CLASSES}>
        <h2 className={SECTION_TITLE_CLASSES}>Description</h2>
        {!editing && (
          <IconButton
            label="Edit description"
            size="xs"
            onClick={() => setEditing(true)}
          >
            <IconPencil strokeWidth="1.8" />
          </IconButton>
        )}
      </div>
      {editing ? (
        <div className="TaskPage__description__edit mt-1 flex flex-col gap-2.5">
          <Textarea
            autosize
            autoFocus
            aria-label="Description"
            size="md"
            minRows={4}
            value={draft}
            placeholder="Add task details, scope, and acceptance criteria."
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setDraft(e.currentTarget.value)
            }
          />
          <div className="TaskPage__description__editActions flex justify-end gap-2">
            <Button
              size="xs"
              icon={<IconX strokeWidth="1.8" />}
              onClick={() => {
                setEditing(false);
                setDraft(task.description || '');
              }}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              loading={saving}
              icon={<IconCheck strokeWidth="1.8" />}
              onClick={saveDescription}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'TaskPage__description__content mt-1 whitespace-pre-wrap text-base leading-normal',
            !task.description &&
              'TaskPage__description__content--empty italic text-muted'
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
        className="TaskPage__fileInput hidden"
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
      <div className="TaskPage__attachments TaskPage__attachments--empty -mt-2 flex flex-col items-end gap-2">
        {attachButton}
      </div>
    );
  }

  return (
    <section className="TaskPage__attachments flex flex-col gap-2">
      <div className={SECTION_HEADER_CLASSES}>
        <h2 className={SECTION_TITLE_CLASSES}>
          Attachments
          <span className="TaskPage__sectionHeader__count font-medium">
            {attachments.length}
          </span>
        </h2>
        {attachButton}
      </div>
      <div className="TaskPage__files grid gap-2">
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
      className={cn(
        TEXT_BUTTON_CLASSES,
        'TaskPage__attachButton inline-flex items-center gap-1'
      )}
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
    <div className="TaskPage__file group relative flex min-w-0 items-center rounded-lg border border-solid border-border bg-surface hover:border-border-strong">
      <a
        className="TaskPage__file__link flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-strong no-underline focus-visible:outline-2 focus-visible:outline-focus"
        href={attachment.src}
        target="_blank"
        rel="noreferrer"
        title={name}
      >
        <span className="TaskPage__file__thumb flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-hover text-subtle">
          {isImageAttachment(attachment) ? (
            <img
              className="size-full object-cover"
              src={attachment.src}
              alt=""
              loading="lazy"
            />
          ) : (
            <IconFile size={16} strokeWidth="1.8" />
          )}
        </span>
        <span className="TaskPage__file__text flex min-w-0 flex-col text-sm leading-snug">
          <span className="TaskPage__file__name truncate font-medium">
            {name}
          </span>
          <span className="TaskPage__file__meta truncate">
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
        <IconButton
          className={cn(
            'TaskPage__file__remove mr-1 focus-visible:opacity-100',
            REVEAL_ON_HOVER_CLASSES
          )}
          label="Remove attachment"
          size="xs"
          disabled={props.removing}
          onClick={props.onRemove}
        >
          <IconX strokeWidth="1.8" />
        </IconButton>
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
    <div className="TaskPage__detail flex flex-col gap-1 py-3">
      <div className="TaskPage__detail__label flex items-center justify-between text-sm font-semibold">
        <span>{props.label}</span>
        {props.action}
      </div>
      <div className="TaskPage__detail__value -ml-2">{props.children}</div>
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
    <div className="TaskPage__details flex flex-col divide-y divide-border lg:-mt-3">
      <TaskDetail label="Status">
        <Menu
          label="Status"
          placement="bottom-start"
          trigger={
            <button
              type="button"
              className={DETAIL_BUTTON_CLASSES}
              disabled={savingField === 'status'}
            >
              <TaskStatusRing status={status} />
              <span>{statusLabel}</span>
              <IconChevronDown
                className={DETAIL_CHEVRON_CLASSES}
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          {TASK_STATUS_OPTIONS.map((option) => (
            <MenuItem
              key={option.value}
              icon={<TaskStatusRing status={option.value} />}
              hint={option.value === status ? <IconCheck /> : undefined}
              aria-current={option.value === status || undefined}
              className={cn(
                option.value === status &&
                  'TaskPage__menuItem--active font-bold'
              )}
              onClick={() => saveStatus(option.value)}
            >
              {option.label}
            </MenuItem>
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
              className={TEXT_BUTTON_CLASSES}
              disabled={savingField === 'assignee'}
              onClick={() => saveAssignee(currentUserEmail)}
            >
              Assign me
            </button>
          )
        }
      >
        <Popover
          label="Assignee"
          open={assigneePopoverOpen}
          onOpenChange={setAssigneePopoverOpen}
          placement="bottom-start"
          width={280}
          trigger={
            <button
              type="button"
              className={cn(
                DETAIL_BUTTON_CLASSES,
                !task.assignee && DETAIL_BUTTON_EMPTY_CLASSES
              )}
              disabled={savingField === 'assignee'}
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
                className={DETAIL_CHEVRON_CLASSES}
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
          label="Priority"
          placement="bottom-start"
          trigger={
            <button
              type="button"
              className={DETAIL_BUTTON_CLASSES}
              disabled={savingField === 'priority'}
            >
              <TaskPriorityBadge priority={priority} />
              <IconChevronDown
                className={DETAIL_CHEVRON_CLASSES}
                size={14}
                strokeWidth="1.8"
              />
            </button>
          }
        >
          {TASK_PRIORITY_OPTIONS.map((option) => (
            <MenuItem
              key={option}
              hint={option === priority ? <IconCheck /> : undefined}
              aria-current={option === priority || undefined}
              className={cn(
                option === priority && 'TaskPage__menuItem--active font-bold'
              )}
              onClick={() => savePriority(option)}
            >
              <TaskPriorityBadge priority={option} />
            </MenuItem>
          ))}
        </Menu>
      </TaskDetail>

      <TaskDetail label="Target launch">
        <Popover
          label="Target launch"
          open={datePopoverOpen}
          onOpenChange={(open) =>
            open ? openDatePopover() : closeDatePopover()
          }
          placement="bottom-start"
          width={300}
          trigger={
            <button
              type="button"
              className={cn(
                DETAIL_BUTTON_CLASSES,
                !targetLaunch && DETAIL_BUTTON_EMPTY_CLASSES
              )}
              disabled={savingField === 'targetLaunchDate'}
            >
              <span className="TaskPage__targetLaunch flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
                    className={cn(
                      'TaskPage__targetLaunch__hint flex gap-1.5 text-sm font-normal text-muted',
                      targetLaunchOverdue &&
                        'TaskPage__targetLaunch__hint--overdue text-danger'
                    )}
                  >
                    <span aria-hidden="true">·</span>
                    {targetLaunchHint}
                  </span>
                )}
              </span>
              <IconChevronDown
                className={DETAIL_CHEVRON_CLASSES}
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
              className={TEXT_BUTTON_CLASSES}
              disabled={savingField === 'cc'}
              onClick={() => saveCcList([...ccList, currentUserEmail])}
            >
              CC me
            </button>
          )
        }
      >
        {ccList.length > 0 && (
          <div
            className="TaskPage__ccList mb-1.5 ml-2 mt-1 flex flex-wrap gap-1.5"
            onCopy={handleCopyCc}
          >
            {ccList.map((email) => (
              <span
                className="TaskPage__ccChip inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full bg-chip pl-0.5 pr-1 text-sm"
                key={email}
                data-user-email={email}
              >
                <UserAvatar email={email} size={18} withTooltip={false} />
                <UserTag className="truncate" email={email} />
                <button
                  type="button"
                  className="TaskPage__ccChip__remove m-0 inline-flex size-5 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted hover:bg-border hover:text-strong focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:hover:bg-transparent"
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
          label="Add people to cc"
          open={ccPopoverOpen}
          onOpenChange={setCcPopoverOpen}
          placement="bottom-start"
          width={280}
          trigger={
            <button
              type="button"
              className={cn(
                TEXT_BUTTON_CLASSES,
                'TaskPage__addPeople ml-2 py-1'
              )}
              disabled={savingField === 'cc'}
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
    <ol className="TaskPage__timeline m-0 flex list-none flex-col gap-3.5 p-0">
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
        className="TaskPage__activityGroup__summary group m-0 flex max-w-full cursor-pointer appearance-none items-center gap-2.5 rounded-sm border-0 bg-transparent py-0 pl-1.5 pr-0 text-left font-sans text-sm leading-5 text-strong focus-visible:outline-2 focus-visible:outline-focus"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <UserAvatarGroup
          className="TaskPage__activityGroup__avatars shrink-0 *:-ml-1.5 *:first:ml-0"
          emails={actors}
          size={18}
          max={3}
        />
        <span className="TaskPage__activityGroup__text min-w-0 wrap-anywhere">
          {summary} ·{' '}
          {firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`}
        </span>
        <span className="TaskPage__activityGroup__toggle inline-flex shrink-0 items-center gap-0.5 font-medium underline-offset-3 group-hover:underline">
          {expanded ? 'Hide' : 'Show all'}
          <IconChevronDown
            className={cn(
              'TaskPage__activityGroup__chevron transition-transform',
              expanded && 'TaskPage__activityGroup__chevron--open rotate-180'
            )}
            size={12}
            strokeWidth="2"
          />
        </span>
      </button>
      {expanded && (
        <ol className="TaskPage__activityGroup__items mb-0 ml-3.5 mr-0 mt-2 flex list-none flex-col gap-2 border-0 border-l border-solid border-border py-1 pl-2.5 pr-0">
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
    <div className="TaskPage__activity flex items-start gap-2.5 pl-1.5 text-sm leading-5">
      <span className="TaskPage__activity__icon inline-flex size-5 shrink-0 items-center justify-center text-subtle">
        <TaskActivityIcon item={item} />
      </span>
      <span className="TaskPage__activity__text min-w-0 wrap-anywhere">
        <b className="font-medium">
          <UserTag email={actor} />
        </b>{' '}
        {item.kind === 'opened' ? (
          'opened this task'
        ) : item.event.field === 'cc' ? (
          <TaskCcEventSummary event={item.event} />
        ) : (
          <>
            changed {formatTaskField(item.event.field)} from{' '}
            <span className={ACTIVITY_VALUE_CLASSES}>
              {formatTaskEventValue(item.event, 'old')}
            </span>{' '}
            to{' '}
            <span className={ACTIVITY_VALUE_CLASSES}>
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
        <b className="font-medium">
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
      <span className={ACTIVITY_VALUE_CLASSES}>
        {formatTaskEventValue(event, 'old')}
      </span>{' '}
      to{' '}
      <span className={ACTIVITY_VALUE_CLASSES}>
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
    <Surface className="TaskPage__thread divide-y divide-border overflow-visible">
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
        <div className="TaskPage__thread__reply px-4 pb-3.5 pt-3 sm:pl-14">
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
    <div
      id={anchorId}
      className="TaskPage__comment group flex scroll-mt-4 gap-3 px-4 pb-5 pt-4 first:rounded-t-lg last:rounded-b-lg target:bg-warning-soft"
    >
      <UserAvatar email={comment.createdBy} size={28} />
      <div className="TaskPage__comment__main min-w-0 flex-1">
        <div className="TaskPage__comment__header flex min-h-6 items-center justify-between gap-2">
          <div className="TaskPage__comment__byline flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <b className="font-semibold">
              <UserTag email={comment.createdBy || 'unknown'} />
            </b>
            {anchorId ? (
              <a
                className="TaskPage__comment__timestamp text-inherit no-underline underline-offset-3 hover:underline"
                href={`#${anchorId}`}
              >
                {formatTaskDateTime(comment.createdAt)}
              </a>
            ) : (
              <span>{formatTaskDateTime(comment.createdAt)}</span>
            )}
            {comment.updatedAt && !comment.isDeleted && <span>(edited)</span>}
          </div>
          <div className="TaskPage__comment__actions flex shrink-0 items-center gap-1">
            {canModify && !editing && (
              <IconButton
                className={cn(
                  'focus-visible:opacity-100',
                  REVEAL_ON_HOVER_CLASSES
                )}
                label="Edit"
                size="xs"
                onClick={() => setEditing(true)}
              >
                <IconPencil strokeWidth="1.8" />
              </IconButton>
            )}
            {canModify && !editing && (
              <IconButton
                className={cn(
                  'focus-visible:opacity-100',
                  REVEAL_ON_HOVER_CLASSES
                )}
                label="Delete"
                size="xs"
                onClick={onDelete}
              >
                <IconTrash strokeWidth="1.8" />
              </IconButton>
            )}
            {props.onReply && (
              <button
                type="button"
                className={cn(TEXT_BUTTON_CLASSES, 'ml-1')}
                onClick={props.onReply}
              >
                Reply
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <div
            className={cn(
              'TaskPage__comment__edit mt-2',
              COMPOSER_FORM_CLASSES
            )}
          >
            <CommentEditor
              variant="minimal"
              value={editBody}
              placeholder="Edit this comment..."
              onChange={setEditBody}
              onSubmitShortcut={onEdit}
            />
            <div className={COMPOSER_ACTIONS_CLASSES}>
              <Button
                className="TaskPage__composer__button"
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
                variant="primary"
                loading={saving}
                disabled={!editBody}
                onClick={onEdit}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="TaskPage__comment__body mt-2.5 whitespace-pre-wrap text-base leading-normal">
            <CommentBody
              body={comment.body}
              content={comment.content}
              deleted={comment.isDeleted}
            />
            {!comment.isDeleted && attachments.length > 0 && (
              <div className="TaskPage__files TaskPage__files--comment mt-2.5 grid gap-2">
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
    <form className={COMPOSER_FORM_CLASSES} onSubmit={onSubmit}>
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
        <div className="TaskPage__composer__attachments flex flex-wrap gap-1.5 px-4 pb-2.5">
          {attachments.map((attachment) => (
            <div
              className="TaskPage__composer__attachment inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border border-solid border-border bg-surface-hover py-0.5 pl-2.5 pr-1.5 text-sm"
              key={attachment.id}
            >
              <IconPaperclip className="shrink-0" size={14} strokeWidth="1.8" />
              <span className="TaskPage__composer__attachment__name truncate">
                {formatTaskAttachmentName(attachment)}
              </span>
              <IconButton
                label="Remove attachment"
                size="xs"
                round
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((a) => a.id !== attachment.id)
                  )
                }
              >
                <IconX strokeWidth="1.8" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div className={COMPOSER_ACTIONS_CLASSES}>
        <TaskAttachFilesButton
          uploading={uploading}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          className="TaskPage__fileInput hidden"
          type="file"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            uploadFiles(Array.from(e.currentTarget.files || []));
          }}
        />
        <div className="TaskPage__composer__actions__spacer flex-1" />
        {props.onCancel && (
          <Button
            className="TaskPage__composer__button"
            type="button"
            onClick={props.onCancel}
          >
            Cancel
          </Button>
        )}
        <Tooltip label="Cmd+Enter to submit">
          <Button
            className="TaskPage__composer__button"
            variant="primary"
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
