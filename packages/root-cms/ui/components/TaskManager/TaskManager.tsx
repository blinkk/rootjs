import './TaskManager.css';

import {
  Badge,
  Button,
  Loader,
  Menu,
  Popover,
  SegmentedControl,
  TextInput,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCalendar,
  IconColumns3,
  IconFlag,
  IconLayoutList,
  IconPlus,
  IconUser,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  createTask,
  isOpenTaskStatus,
  normalizeTaskStatus,
  subscribeOpenTasks,
  subscribeTasks,
  Task,
  TaskPriority,
} from '../../utils/tasks.js';
import {Surface} from '../Surface/Surface.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {UserTag} from '../UserTag/UserTag.js';

type TaskFilter =
  'open' | 'all' | 'closed' | 'assigned-to-me' | 'created-by-me';
type TaskLayout = 'list' | 'board';
type TaskListLayout = TaskLayout | 'compact';
type TaskManagerVariant = 'compact' | 'page';
type TaskScope = 'all' | 'open';

const TASK_STATUS_COLUMNS = [
  {value: 'new', label: 'New'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'in-review', label: 'In review'},
  {value: 'closed', label: 'Closed'},
];

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
    'list'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [targetLaunchDate, setTargetLaunchDate] = useState('');
  const [targetDatePopoverOpen, setTargetDatePopoverOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const filterOptions = showPageLayout
    ? TASK_PAGE_FILTER_OPTIONS
    : TASK_COMPACT_FILTER_OPTIONS;
  const visibleTasks = useMemo(() => {
    return filterTasks(tasks, filter, currentUserEmail);
  }, [tasks, filter, currentUserEmail]);
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
        targetLaunchDate: parseTargetLaunchDate(targetLaunchDate),
      });
      setTitle('');
      setDescription('');
      setAssigneeEmail('');
      setPriority('normal');
      setTargetLaunchDate('');
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
                  {assigneeEmail ? formatTaskUser(assigneeEmail) : 'Assignee'}
                </span>
              </button>
            }
          >
            <div className="TaskManager__composer__popover">
              <TextInput
                autoFocus
                label="Email"
                placeholder="teammate@example.com"
                size="xs"
                type="email"
                value={assigneeEmail}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setAssigneeEmail(e.currentTarget.value)
                }
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setAssignPopoverOpen(false);
                  }
                }}
              />
              <div className="TaskManager__composer__popover__actions">
                <Button
                  compact
                  size="xs"
                  variant="default"
                  onClick={() => setAssigneeEmail('')}
                >
                  Clear
                </Button>
                <Button
                  compact
                  size="xs"
                  color="dark"
                  onClick={() => setAssignPopoverOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
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
            onClose={() => setTargetDatePopoverOpen(false)}
            position="bottom"
            shadow="md"
            width={260}
            withArrow
            target={
              <button
                className={joinClassNames(
                  'TaskManager__composer__control',
                  targetLaunchDate && 'TaskManager__composer__control--set'
                )}
                type="button"
                aria-expanded={targetDatePopoverOpen}
                onClick={() => setTargetDatePopoverOpen(!targetDatePopoverOpen)}
              >
                <IconCalendar size={14} strokeWidth="2" />
                <span>
                  {targetLaunchDate
                    ? formatTargetLaunchDateLabel(targetLaunchDate)
                    : 'Target date'}
                </span>
              </button>
            }
          >
            <div className="TaskManager__composer__popover">
              <label className="TaskManager__composer__dateLabel">
                Target launch date
                <input
                  type="date"
                  value={targetLaunchDate}
                  onInput={(e) => {
                    setTargetLaunchDate(
                      (e.currentTarget as HTMLInputElement).value
                    );
                  }}
                />
              </label>
              <div className="TaskManager__composer__popover__actions">
                <Button
                  compact
                  size="xs"
                  variant="default"
                  onClick={() => setTargetLaunchDate('')}
                >
                  Clear
                </Button>
                <Button
                  compact
                  size="xs"
                  color="dark"
                  onClick={() => setTargetDatePopoverOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
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
        <nav className="TaskManager__tabs" aria-label="Task filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={joinClassNames(
                'TaskManager__tab',
                filter === option.value && 'TaskManager__tab--active'
              )}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              {!loading && (
                <span className="TaskManager__tab__count">
                  {filterCounts[option.value] ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="TaskManager__listHeader__actions">
          {showPageLayout ? (
            <SegmentedControl
              className="TaskManager__layoutToggle"
              size="sm"
              value={layout}
              onChange={(value: TaskLayout) => setLayout(value)}
              data={TASK_LAYOUT_OPTIONS}
            />
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
            <div className="TaskManager__group__header">
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
  const overdue =
    isOpenTaskStatus(task.status) && isPastDate(task.targetLaunchDate);
  return (
    <a className="TaskManager__listRow" href={`/cms/tasks/${task.id}`}>
      {task.assignee ? (
        <UserAvatar email={task.assignee} size={28} />
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
      <span
        className={joinClassNames(
          'TaskManager__listRow__date',
          overdue && 'TaskManager__listRow__date--overdue'
        )}
      >
        {task.targetLaunchDate ? formatTargetDate(task.targetLaunchDate) : '—'}
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
function TaskPriorityBadge(props: {priority: TaskPriority}) {
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
function TaskStatusRing(props: {status: string}) {
  return (
    <span
      className={`TaskManager__statusRing TaskManager__statusRing--${props.status}`}
      aria-hidden="true"
    />
  );
}

/** Renders tasks grouped by status in a board. */
function TaskBoard(props: {filter: TaskFilter; tasks: Task[]}) {
  const columns = getTaskStatusColumns(props.tasks, props.filter);
  return (
    <div className="TaskManager__board">
      {columns.map((column) => {
        const columnTasks = props.tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        return (
          <section className="TaskManager__boardColumn" key={column.value}>
            <div className="TaskManager__boardColumn__header">
              <span>{column.label}</span>
              <span>{columnTasks.length}</span>
            </div>
            <div className="TaskManager__boardColumn__tasks">
              {columnTasks.length === 0 && (
                <div className="TaskManager__boardColumn__empty">No tasks</div>
              )}
              {columnTasks.map((task) => (
                <TaskBoardCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Renders a single task card for the board. */
function TaskBoardCard(props: {task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  return (
    <a className="TaskManager__boardCard" href={`/cms/tasks/${task.id}`}>
      <div className="TaskManager__boardCard__title">{task.title}</div>
      {task.description && (
        <div className="TaskManager__boardCard__description">
          {task.description}
        </div>
      )}
      <div className="TaskManager__boardCard__meta">
        #{task.id} opened {formatTaskDate(task.createdAt)} by{' '}
        <UserTag email={createdBy} />
      </div>
      <div className="TaskManager__boardCard__badges">
        <TaskPriorityBadge priority={formatTaskPriority(task.priority)} />
        <span className="TaskManager__boardCard__badge">
          {task.assignee ? <UserTag email={task.assignee} /> : 'Unassigned'}
        </span>
        {task.targetLaunchDate && (
          <span className="TaskManager__boardCard__badge">
            target {formatTaskDate(task.targetLaunchDate)}
          </span>
        )}
      </div>
    </a>
  );
}

function TaskRow(props: {task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
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
        {task.targetLaunchDate && (
          <div className="TaskManager__taskRow__date">
            target {formatTaskDate(task.targetLaunchDate)}
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

function formatTaskUser(email: string) {
  return email.split('@')[0] || email;
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

/** Formats a target date as "Today" or a short date (e.g. "Aug 12"). */
function formatTargetDate(ts: Task['createdAt']) {
  if (!ts?.toMillis) {
    return '—';
  }
  const date = new Date(ts.toMillis());
  if (date.toDateString() === new Date().toDateString()) {
    return 'Today';
  }
  return formatTaskDate(ts);
}

/** Returns true if the timestamp falls on a day before today. */
function isPastDate(ts?: Task['createdAt'] | null) {
  if (!ts?.toMillis) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return ts.toMillis() < today.getTime();
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

function formatTargetLaunchDateLabel(value: string) {
  const date = parseTargetLaunchDate(value);
  if (!date) {
    return 'target launch date';
  }
  return date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}
