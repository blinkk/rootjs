import './TaskManager.css';

import {
  Badge,
  Button,
  Loader,
  Menu,
  Popover,
  SegmentedControl,
} from '@mantine/core';
import {
  IconArrowsSort,
  IconCalendar,
  IconCheck,
  IconColumns3,
  IconFlag,
  IconLayoutList,
  IconPlus,
  IconUser,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Surface} from '../../../../components/Surface/Surface.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {UserSelect} from '../../../users/UserSelect/UserSelect.js';
import {UserTag} from '../../../users/UserTag/UserTag.js';
import {
  createTask,
  formatTaskTargetLaunch,
  getTaskTargetLaunch,
  isOpenTaskStatus,
  isTaskTargetLaunchPast,
  normalizeTaskStatus,
  subscribeOpenTasks,
  subscribeTasks,
  Task,
  TaskPriority,
  TaskTargetLaunchInput,
  toTaskTargetLaunch,
  updateTaskStatus,
} from '../../tasks.js';
import {
  parseTaskTargetLaunchDraft,
  TaskTargetLaunchDraft,
  TaskTargetLaunchLabel,
  TaskTargetLaunchPicker,
  toTaskTargetLaunchDraft,
} from '../TaskTargetLaunch/TaskTargetLaunch.js';

type TaskFilter =
  'open' | 'all' | 'closed' | 'assigned-to-me' | 'created-by-me';
type TaskLayout = 'list' | 'board';
type TaskListLayout = TaskLayout | 'compact';
type TaskManagerVariant = 'compact' | 'page';
type TaskScope = 'all' | 'open';
type TaskSort = 'created' | 'priority' | 'target-launch';

const TASK_STATUS_COLUMNS = [
  {value: 'new', label: 'New'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'in-review', label: 'In review'},
  {value: 'closed', label: 'Closed'},
];

/** Data transfer type used when dragging a task card on the board. */
const TASK_DRAG_MIME_TYPE = 'application/x-root-cms-task-id';

const TASK_OPEN_STATUS_COLUMNS = TASK_STATUS_COLUMNS.filter(
  (column) => column.value !== 'closed'
);

const TASK_CLOSED_STATUS_COLUMNS = TASK_STATUS_COLUMNS.filter(
  (column) => column.value === 'closed'
);

const TASK_LAYOUT_OPTIONS = [
  {
    value: 'list',
    label: (
      <span className="TaskManager__layoutOption">
        <IconLayoutList size={16} strokeWidth="1.8" />
        List
      </span>
    ),
  },
  {
    value: 'board',
    label: (
      <span className="TaskManager__layoutOption">
        <IconColumns3 size={16} strokeWidth="1.8" />
        Board
      </span>
    ),
  },
];

const TASK_SORT_OPTIONS: Array<{value: TaskSort; label: string}> = [
  {value: 'created', label: 'Create date'},
  {value: 'priority', label: 'Priority'},
  {value: 'target-launch', label: 'Target launch'},
];

const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  normal: 2,
};

const TASK_COMPACT_FILTER_OPTIONS: Array<{value: TaskFilter; label: string}> = [
  {value: 'open', label: 'Active'},
  {value: 'assigned-to-me', label: 'Assigned to me'},
];

const TASK_PAGE_FILTER_OPTIONS: Array<{value: TaskFilter; label: string}> = [
  {value: 'open', label: 'Active'},
  {value: 'assigned-to-me', label: 'Assigned to me'},
  {value: 'created-by-me', label: 'Created by me'},
  {value: 'closed', label: 'Closed'},
  {value: 'all', label: 'All'},
];

export interface TaskManagerProps {
  className?: string;
  variant?: TaskManagerVariant;
}

/** Renders the task composer and task list for CMS pages. */
export function TaskManager(props: TaskManagerProps) {
  const currentUserEmail = window.firebase.user.email || '';
  const variant = props.variant || 'compact';
  const showPageLayout = variant === 'page';
  const {tasks, loading, error} = useTasks(showPageLayout ? 'all' : 'open');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [layout, setLayout] = useLocalStorage<TaskLayout>(
    'root-cms-task-manager-layout-v3',
    'board'
  );
  const [sort, setSort] = useLocalStorage<TaskSort>(
    'root-cms-task-manager-sort',
    'created'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [targetLaunch, setTargetLaunch] =
    useState<TaskTargetLaunchInput | null>(null);
  const [targetLaunchDraft, setTargetLaunchDraft] =
    useState<TaskTargetLaunchDraft>(() => toTaskTargetLaunchDraft(null));
  const [targetDatePopoverOpen, setTargetDatePopoverOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const filterOptions = showPageLayout
    ? TASK_PAGE_FILTER_OPTIONS
    : TASK_COMPACT_FILTER_OPTIONS;
  const visibleTasks = useMemo(() => {
    const filteredTasks = filterTasks(tasks, filter, currentUserEmail);
    return sortTasks(filteredTasks, showPageLayout ? sort : 'created');
  }, [tasks, filter, currentUserEmail, showPageLayout, sort]);
  const filterCounts = useMemo(() => {
    const counts: Partial<Record<TaskFilter, number>> = {};
    filterOptions.forEach((option) => {
      counts[option.value] = filterTasks(
        tasks,
        option.value,
        currentUserEmail
      ).length;
    });
    return counts;
  }, [tasks, filterOptions, currentUserEmail]);
  const canCreate = Boolean(title.trim()) && !creating;
  const descriptionOpen = Boolean(title.trim() || description);

  function openTargetDatePopover() {
    setTargetLaunchDraft(
      toTaskTargetLaunchDraft(toDisplayLaunch(targetLaunch))
    );
    setTargetDatePopoverOpen(true);
  }

  /** Closes the target date popover, keeping the draft if it's complete. */
  function closeTargetDatePopover(options?: {clear?: boolean}) {
    setTargetDatePopoverOpen(false);
    if (options?.clear) {
      setTargetLaunch(null);
      return;
    }
    const value = parseTaskTargetLaunchDraft(targetLaunchDraft);
    if (value) {
      setTargetLaunch(value);
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    const taskTitle = title.trim();
    if (!taskTitle) {
      return;
    }
    setCreating(true);
    try {
      await createTask({
        title: taskTitle,
        description: description.trim(),
        assignee: assigneeEmail.trim() || undefined,
        priority,
        targetLaunch,
      });
      setTitle('');
      setDescription('');
      setAssigneeEmail('');
      setPriority('normal');
      setTargetLaunch(null);
      showNotification({
        title: 'Task created',
        message: taskTitle,
        autoClose: 4000,
      });
    } catch (err) {
      showNotification({
        title: 'Could not create task',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className={joinClassNames(
        props.className,
        'TaskManager',
        showPageLayout && 'TaskManager--page'
      )}
    >
      <form className="TaskManager__composer" onSubmit={(e) => onSubmit(e)}>
        <IconPlus
          className="TaskManager__composer__icon"
          size={18}
          strokeWidth="2"
        />
        <input
          className="TaskManager__composer__title"
          type="text"
          aria-label="Task title"
          value={title}
          placeholder="Add a task…"
          onInput={(e) => {
            setTitle((e.currentTarget as HTMLInputElement).value);
          }}
        />
        <div
          className={joinClassNames(
            'TaskManager__composer__drawer',
            descriptionOpen && 'TaskManager__composer__drawer--open'
          )}
          aria-hidden={!descriptionOpen}
        >
          <div className="TaskManager__composer__drawer__inner">
            <textarea
              className="TaskManager__composer__description"
              aria-label="Task description"
              value={description}
              rows={3}
              tabIndex={descriptionOpen ? 0 : -1}
              placeholder="Add a description. Specify scope, collection, and acceptance criteria."
              onInput={(e) => {
                setDescription((e.currentTarget as HTMLTextAreaElement).value);
              }}
            />
          </div>
        </div>
        <div className="TaskManager__composer__controls">
          <Popover
            opened={assignPopoverOpen}
            onClose={() => setAssignPopoverOpen(false)}
            position="bottom"
            shadow="md"
            width={280}
            withArrow
            target={
              <button
                className={joinClassNames(
                  'TaskManager__composer__control',
                  assigneeEmail && 'TaskManager__composer__control--set'
                )}
                type="button"
                aria-expanded={assignPopoverOpen}
                onClick={() => setAssignPopoverOpen(!assignPopoverOpen)}
              >
                {assigneeEmail ? (
                  <UserAvatar
                    email={assigneeEmail}
                    size={16}
                    withTooltip={false}
                  />
                ) : (
                  <IconUser size={14} strokeWidth="2" />
                )}
                <span>
                  {assigneeEmail ? (
                    <UserTag email={assigneeEmail} />
                  ) : (
                    'Assignee'
                  )}
                </span>
              </button>
            }
          >
            <UserSelect
              autoFocus
              initiallyOpened
              value={assigneeEmail}
              onChange={(email: string) => {
                setAssigneeEmail(email);
                setAssignPopoverOpen(false);
              }}
            />
          </Popover>
          <Menu
            position="bottom"
            shadow="md"
            control={
              <button
                className={joinClassNames(
                  'TaskManager__composer__control',
                  priority !== 'normal' && 'TaskManager__composer__control--set'
                )}
                type="button"
              >
                <IconFlag size={14} strokeWidth="2" />
                <span>
                  {priority === 'normal'
                    ? 'Priority'
                    : formatTaskPriorityLabel(priority)}
                </span>
              </button>
            }
          >
            {(['high', 'medium', 'normal'] as TaskPriority[]).map((option) => (
              <Menu.Item
                key={option}
                className={
                  priority === option
                    ? 'TaskManager__composer__menuItem--active'
                    : ''
                }
                onClick={() => setPriority(option)}
              >
                {formatTaskPriorityLabel(option)}
              </Menu.Item>
            ))}
          </Menu>
          <Popover
            opened={targetDatePopoverOpen}
            onClose={() => closeTargetDatePopover()}
            position="bottom"
            shadow="md"
            width={300}
            withArrow
            target={
              <button
                className={joinClassNames(
                  'TaskManager__composer__control',
                  targetLaunch && 'TaskManager__composer__control--set'
                )}
                type="button"
                aria-expanded={targetDatePopoverOpen}
                onClick={() =>
                  targetDatePopoverOpen
                    ? closeTargetDatePopover()
                    : openTargetDatePopover()
                }
              >
                <IconCalendar size={14} strokeWidth="2" />
                <span>
                  {targetLaunch
                    ? formatTaskTargetLaunch(toDisplayLaunch(targetLaunch), {
                        short: true,
                      })
                    : 'Target date'}
                </span>
              </button>
            }
          >
            <TaskTargetLaunchPicker
              value={targetLaunchDraft}
              onChange={setTargetLaunchDraft}
              onClear={() => closeTargetDatePopover({clear: true})}
              onDone={() => closeTargetDatePopover()}
            />
          </Popover>
        </div>
        <Button
          className="TaskManager__composer__submit"
          type="submit"
          color="dark"
          radius={8}
          loading={creating}
          disabled={!canCreate}
        >
          Create
        </Button>
      </form>

      <div className="TaskManager__listHeader">
        <SegmentedControl
          className="TaskManager__filters"
          aria-label="Task filters"
          size="sm"
          value={filter}
          onChange={(value: TaskFilter) => setFilter(value)}
          data={filterOptions.map((option) => ({
            value: option.value,
            label: (
              <span className="TaskManager__filter">
                {option.label}
                {!loading && (
                  <span className="TaskManager__filter__count">
                    {filterCounts[option.value] ?? 0}
                  </span>
                )}
              </span>
            ),
          }))}
        />
        <div className="TaskManager__listHeader__actions">
          {showPageLayout ? (
            <>
              <TaskSortMenu value={sort} onChange={setSort} />
              <SegmentedControl
                className="TaskManager__layoutToggle"
                size="sm"
                value={layout}
                onChange={(value: TaskLayout) => setLayout(value)}
                data={TASK_LAYOUT_OPTIONS}
              />
            </>
          ) : (
            <Button
              component="a"
              href="/cms/tasks"
              variant="default"
              size="xs"
              compact
            >
              Show all
            </Button>
          )}
        </div>
      </div>

      <TaskListContent
        error={error}
        filter={filter}
        layout={showPageLayout ? layout : 'compact'}
        loading={loading}
        tasks={visibleTasks}
      />
    </div>
  );
}

/** Renders a menu for choosing how tasks are sorted. */
function TaskSortMenu(props: {
  value: TaskSort;
  onChange: (value: TaskSort) => void;
}) {
  const current =
    TASK_SORT_OPTIONS.find((option) => option.value === props.value) ||
    TASK_SORT_OPTIONS[0];
  return (
    <Menu
      position="bottom"
      placement="end"
      shadow="md"
      control={
        <button
          className="TaskManager__sortToggle"
          type="button"
          aria-label={`Sort by ${current.label.toLowerCase()}`}
        >
          <IconArrowsSort size={16} strokeWidth="1.8" />
          <span>{current.label}</span>
        </button>
      }
    >
      <Menu.Label>Sort by</Menu.Label>
      {TASK_SORT_OPTIONS.map((option) => (
        <Menu.Item
          key={option.value}
          icon={
            <IconCheck
              size={14}
              strokeWidth="2"
              style={{
                visibility: option.value === props.value ? 'visible' : 'hidden',
              }}
            />
          }
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </Menu.Item>
      ))}
    </Menu>
  );
}

interface TaskListContentProps {
  error: string;
  filter: TaskFilter;
  layout: TaskListLayout;
  loading: boolean;
  tasks: Task[];
}

/** Renders the current task list view and shared loading states. */
function TaskListContent(props: TaskListContentProps) {
  const {error, filter, layout, loading, tasks} = props;
  if (loading) {
    return (
      <Surface className="TaskManager__list">
        <div className="TaskManager__list__state">
          <Loader color="gray" size="sm" />
        </div>
      </Surface>
    );
  }
  if (error) {
    return (
      <Surface className="TaskManager__list">
        <div className="TaskManager__list__state error">{error}</div>
      </Surface>
    );
  }
  if (tasks.length === 0) {
    return (
      <Surface className="TaskManager__list">
        <div className="TaskManager__list__state">
          {getEmptyTaskMessage(filter, layout)}
        </div>
      </Surface>
    );
  }
  if (layout === 'board') {
    return <TaskBoard filter={filter} tasks={tasks} />;
  }
  if (layout === 'list') {
    return <TaskGroupedList filter={filter} tasks={tasks} />;
  }
  return (
    <Surface className="TaskManager__list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Surface>
  );
}

/** Renders tasks in a list, with a separate group for each status. */
function TaskGroupedList(props: {filter: TaskFilter; tasks: Task[]}) {
  const columns = getTaskStatusColumns(props.tasks, props.filter);
  return (
    <div className="TaskManager__groups">
      {columns.map((column) => {
        const columnTasks = props.tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        if (columnTasks.length === 0) {
          return null;
        }
        return (
          <Surface className="TaskManager__group" key={column.value}>
            <div
              className={`TaskManager__group__header TaskManager__group__header--${column.value}`}
            >
              <TaskStatusRing status={column.value} />
              <h2 className="TaskManager__group__title">{column.label}</h2>
              <span className="TaskManager__group__count">
                {columnTasks.length}
              </span>
            </div>
            {columnTasks.map((task) => (
              <TaskListRow key={task.id} task={task} />
            ))}
          </Surface>
        );
      })}
    </div>
  );
}

/** Renders a single row in the grouped task list. */
function TaskListRow(props: {task: Task}) {
  const {task} = props;
  const priority = formatTaskPriority(task.priority);
  const targetLaunch = getTaskTargetLaunch(task);
  const overdue =
    isOpenTaskStatus(task.status) && isTaskTargetLaunchPast(targetLaunch);
  return (
    <a className="TaskManager__listRow" href={`/cms/tasks/${task.id}`}>
      {task.assignee ? (
        <UserAvatar email={task.assignee} size={24} />
      ) : (
        <span
          className="TaskManager__listRow__unassigned"
          title="Unassigned"
          aria-label="Unassigned"
        >
          <IconUser size={14} strokeWidth="2" />
        </span>
      )}
      <span className="TaskManager__listRow__content">
        <span className="TaskManager__listRow__title">{task.title}</span>
        <span className="TaskManager__listRow__id">#{task.id}</span>
      </span>
      <TaskPriorityBadge priority={priority} />
      <span className="TaskManager__listRow__date">
        {targetLaunch ? (
          <TaskTargetLaunchLabel
            launch={targetLaunch}
            overdue={overdue}
            short
          />
        ) : (
          '—'
        )}
      </span>
    </a>
  );
}

/** Gradient colors for each priority badge, matching the doc status badges. */
const TASK_PRIORITY_GRADIENTS: Record<
  TaskPriority,
  {from: string; to: string; deg?: number}
> = {
  high: {from: 'red', to: 'grape', deg: 35},
  medium: {from: 'orange', to: 'red'},
  normal: {from: 'indigo', to: 'cyan'},
};

/** Renders a gradient pill for a task's priority. */
export function TaskPriorityBadge(props: {priority: TaskPriority}) {
  return (
    <Badge
      size="sm"
      variant="gradient"
      gradient={TASK_PRIORITY_GRADIENTS[props.priority]}
      classNames={{
        root: joinClassNames(
          'TaskManager__priorityBadge',
          `TaskManager__priorityBadge--${props.priority}`
        ),
      }}
    >
      {props.priority}
    </Badge>
  );
}

/** Renders a small ring icon that reflects a task's status. */
export function TaskStatusRing(props: {status: string}) {
  return (
    <span
      className={`TaskManager__statusRing TaskManager__statusRing--${props.status}`}
      aria-hidden="true"
    />
  );
}

/**
 * Renders tasks grouped by status in a board. Cards can be dragged between
 * columns to change their status.
 */
function TaskBoard(props: {filter: TaskFilter; tasks: Task[]}) {
  // Statuses set by a drop that haven't been reflected in `props.tasks` yet,
  // keyed by task id. Status updates run in a transaction, so the snapshot
  // listener doesn't see them until the write commits.
  const [pendingStatuses, setPendingStatuses] = useState<
    Record<string, string>
  >({});
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tasks = useMemo(() => {
    return props.tasks.map((task) => {
      const pendingStatus = pendingStatuses[task.id];
      return pendingStatus ? {...task, status: pendingStatus} : task;
    });
  }, [props.tasks, pendingStatuses]);
  const columns = getTaskStatusColumns(tasks, props.filter);

  // Drop pending statuses once the snapshot catches up.
  useEffect(() => {
    setPendingStatuses((prev) => {
      const next = {...prev};
      let changed = false;
      props.tasks.forEach((task) => {
        if (next[task.id] && getTaskStatusValue(task) === next[task.id]) {
          delete next[task.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [props.tasks]);

  function clearPendingStatus(taskId: string) {
    setPendingStatuses((prev) => {
      const next = {...prev};
      delete next[taskId];
      return next;
    });
  }

  async function moveTask(taskId: string, status: string) {
    const task = tasks.find((task) => task.id === taskId);
    if (!task || getTaskStatusValue(task) === status) {
      return;
    }
    setPendingStatuses((prev) => ({...prev, [taskId]: status}));
    try {
      await updateTaskStatus(taskId, status);
    } catch (err) {
      clearPendingStatus(taskId);
      showNotification({
        title: 'Could not update task status',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  function onDrop(e: DragEvent, status: string) {
    e.preventDefault();
    setDropTarget(null);
    setDraggingTaskId(null);
    const taskId = e.dataTransfer?.getData(TASK_DRAG_MIME_TYPE);
    if (taskId) {
      moveTask(taskId, status);
    }
  }

  return (
    <div className="TaskManager__board">
      {columns.map((column) => {
        const columnTasks = tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        return (
          <section
            className={joinClassNames(
              'TaskManager__boardColumn',
              `TaskManager__boardColumn--${column.value}`,
              dropTarget === column.value &&
                'TaskManager__boardColumn--dropTarget'
            )}
            key={column.value}
            onDragOver={(e) => {
              if (!e.dataTransfer?.types.includes(TASK_DRAG_MIME_TYPE)) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropTarget !== column.value) {
                setDropTarget(column.value);
              }
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (!related || !e.currentTarget.contains(related)) {
                setDropTarget((prev) => (prev === column.value ? null : prev));
              }
            }}
            onDrop={(e) => onDrop(e, column.value)}
          >
            <div className="TaskManager__boardColumn__header">
              <TaskStatusRing status={column.value} />
              <h2 className="TaskManager__boardColumn__title">
                {column.label}
              </h2>
              <span className="TaskManager__boardColumn__count">
                {columnTasks.length}
              </span>
            </div>
            <div className="TaskManager__boardColumn__tasks">
              {columnTasks.length === 0 && (
                <div className="TaskManager__boardColumn__empty">No tasks</div>
              )}
              {columnTasks.map((task) => (
                <TaskBoardCard
                  key={task.id}
                  task={task}
                  dragging={draggingTaskId === task.id}
                  onDragStart={() => setDraggingTaskId(task.id)}
                  onDragEnd={() => {
                    setDraggingTaskId(null);
                    setDropTarget(null);
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface TaskBoardCardProps {
  task: Task;
  /** Whether the card is currently being dragged. */
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/** Renders a single draggable task card for the board. */
function TaskBoardCard(props: TaskBoardCardProps) {
  const {task} = props;
  const targetLaunch = getTaskTargetLaunch(task);
  const overdue =
    isOpenTaskStatus(task.status) && isTaskTargetLaunchPast(targetLaunch);
  return (
    <a
      className={joinClassNames(
        'TaskManager__boardCard',
        props.dragging && 'TaskManager__boardCard--dragging'
      )}
      href={`/cms/tasks/${task.id}`}
      draggable
      onDragStart={(e) => {
        if (!e.dataTransfer) {
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TASK_DRAG_MIME_TYPE, task.id);
        props.onDragStart?.();
      }}
      onDragEnd={() => props.onDragEnd?.()}
    >
      <div className="TaskManager__boardCard__header">
        <span className="TaskManager__boardCard__id">#{task.id}</span>
        <TaskPriorityBadge priority={formatTaskPriority(task.priority)} />
      </div>
      <div className="TaskManager__boardCard__title">{task.title}</div>
      {task.description && (
        <div className="TaskManager__boardCard__description">
          {task.description}
        </div>
      )}
      <div className="TaskManager__boardCard__footer">
        <span className="TaskManager__boardCard__date">
          {targetLaunch ? (
            <TaskTargetLaunchLabel
              launch={targetLaunch}
              overdue={overdue}
              short
              withIcon
            />
          ) : (
            'No date'
          )}
        </span>
        {task.assignee ? (
          <UserAvatar email={task.assignee} size={24} />
        ) : (
          <span
            className="TaskManager__listRow__unassigned"
            title="Unassigned"
            aria-label="Unassigned"
          >
            <IconUser size={12} strokeWidth="2" />
          </span>
        )}
      </div>
    </a>
  );
}

function TaskRow(props: {task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  const targetLaunch = getTaskTargetLaunch(task);
  return (
    <a className="TaskManager__taskRow" href={`/cms/tasks/${task.id}`}>
      <div className="TaskManager__taskRow__avatar">
        {task.assignee && <UserAvatar email={task.assignee} size={28} />}
      </div>
      <div className="TaskManager__taskRow__content">
        <div className="TaskManager__taskRow__title">{task.title}</div>
        <div className="TaskManager__taskRow__meta">
          opened {formatTaskDate(task.createdAt)} by{' '}
          <UserTag email={createdBy} />
        </div>
      </div>
      <div className="TaskManager__taskRow__badges">
        <div className="TaskManager__taskRow__status">
          <span></span>
          {formatTaskStatus(task.status)}
        </div>
        <TaskPriorityBadge priority={formatTaskPriority(task.priority)} />
        {targetLaunch && (
          <div className="TaskManager__taskRow__date">
            target {formatTaskTargetLaunch(targetLaunch)}
          </div>
        )}
      </div>
    </a>
  );
}

function useTasks(scope: TaskScope) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const subscribe = scope === 'all' ? subscribeTasks : subscribeOpenTasks;
    const unsubscribe = subscribe(
      (nextTasks) => {
        setTasks(nextTasks);
        setError('');
        setLoading(false);
      },
      (err) => {
        setError(errorMessage(err));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [scope]);

  return {tasks, loading, error};
}

function filterTasks(
  tasks: Task[],
  filter: TaskFilter,
  currentUserEmail: string
) {
  switch (filter) {
    case 'all':
      return tasks;
    case 'closed':
      return tasks.filter((task) => !isOpenTaskStatus(task.status));
    case 'assigned-to-me':
      return tasks.filter((task) => task.assignee === currentUserEmail);
    case 'created-by-me':
      return tasks.filter((task) => task.createdBy === currentUserEmail);
    case 'open':
    default:
      return tasks.filter((task) => isOpenTaskStatus(task.status));
  }
}

/** Returns a sorted copy of the tasks. Ties fall back to newest first. */
function sortTasks(tasks: Task[], sort: TaskSort) {
  return [...tasks].sort((a, b) => {
    let diff = 0;
    if (sort === 'priority') {
      diff =
        TASK_PRIORITY_RANK[formatTaskPriority(a.priority)] -
        TASK_PRIORITY_RANK[formatTaskPriority(b.priority)];
    } else if (sort === 'target-launch') {
      diff = getTargetLaunchSortKey(a) - getTargetLaunchSortKey(b);
    }
    return diff || getCreatedMillis(b) - getCreatedMillis(a);
  });
}

/**
 * Returns a sort key for a task's target launch: ASAP first, then dated
 * launches soonest first, then "anytime", then tasks with no target launch.
 */
function getTargetLaunchSortKey(task: Task) {
  const launch = getTaskTargetLaunch(task);
  if (!launch) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (launch.type === 'asap') {
    return Number.MIN_SAFE_INTEGER;
  }
  if (launch.type === 'anytime' || !launch.date) {
    return Number.MAX_SAFE_INTEGER - 1;
  }
  return launch.date.toMillis();
}

function getCreatedMillis(task: Task) {
  return task.createdAt?.toMillis?.() || 0;
}

function getEmptyTaskMessage(filter: TaskFilter, layout: TaskListLayout) {
  switch (filter) {
    case 'assigned-to-me':
      return layout === 'compact'
        ? 'No active tasks are assigned to you.'
        : 'No tasks are assigned to you.';
    case 'created-by-me':
      return 'No tasks created by you.';
    case 'closed':
      return 'No closed tasks yet.';
    case 'all':
      return 'No tasks yet.';
    case 'open':
    default:
      return 'No active tasks yet.';
  }
}

function formatTaskDate(ts?: Task['createdAt']) {
  if (!ts?.toMillis) {
    return 'just now';
  }
  return new Date(ts.toMillis()).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTaskStatus(status?: string) {
  return normalizeTaskStatus(status).replace(/[-_]/g, ' ');
}

function getTaskStatusValue(task: Task) {
  return normalizeTaskStatus(task.status);
}

function getTaskStatusColumns(tasks: Task[], filter: TaskFilter) {
  const baseColumns =
    filter === 'open'
      ? TASK_OPEN_STATUS_COLUMNS
      : filter === 'closed'
        ? TASK_CLOSED_STATUS_COLUMNS
        : TASK_STATUS_COLUMNS;
  const knownStatuses = new Set(baseColumns.map((column) => column.value));
  const customStatuses = tasks
    .map((task) => getTaskStatusValue(task))
    .filter((status) => !knownStatuses.has(status));
  return [
    ...baseColumns,
    ...Array.from(new Set(customStatuses)).map((value) => ({
      value,
      label: formatTaskStatus(value),
    })),
  ];
}

function formatTaskPriority(priority?: TaskPriority) {
  return priority || 'normal';
}

function formatTaskPriorityLabel(priority: TaskPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/** Converts an unsaved target launch to the stored shape for display. */
function toDisplayLaunch(input: TaskTargetLaunchInput | null) {
  if (!input) {
    return null;
  }
  return toTaskTargetLaunch(
    input.type,
    input.date ? Timestamp.fromDate(input.date) : null
  );
}
