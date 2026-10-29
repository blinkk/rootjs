import './TaskManager.css';

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
import type {JSX} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Surface} from '../../../../components/Surface/Surface.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {Badge, BadgeGradient} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Menu, MenuGroup, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn, joinClassNames} from '../../../../utils/classes.js';
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

const TASK_LAYOUT_OPTIONS: Array<{value: TaskLayout; label: JSX.Element}> = [
  {
    value: 'list',
    label: (
      <span className="TaskManager__layoutOption flex items-center justify-center gap-1.5">
        <IconLayoutList className="size-4 shrink-0" strokeWidth="1.8" />
        List
      </span>
    ),
  },
  {
    value: 'board',
    label: (
      <span className="TaskManager__layoutOption flex items-center justify-center gap-1.5">
        <IconColumns3 className="size-4 shrink-0" strokeWidth="1.8" />
        Board
      </span>
    ),
  },
];

/**
 * Background tint for each status, shared by the list group headers and the
 * board columns. Custom statuses use the neutral tint.
 */
const TASK_STATUS_BG_CLASSES: Record<string, string> = {
  'in-progress': 'bg-task-in-progress',
  'in-review': 'bg-task-in-review',
  closed: 'bg-task-closed',
};

function getTaskStatusBgClass(status: string) {
  return TASK_STATUS_BG_CLASSES[status] || 'bg-task-new';
}

/** Classes for the composer's assignee, priority and target date buttons. */
function composerControlClasses(set: boolean) {
  return cn(
    'TaskManager__composer__control',
    set && 'TaskManager__composer__control--set',
    'inline-flex h-control-sm cursor-pointer appearance-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-border-strong bg-transparent px-2.5 font-sans text-sm text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus',
    set && 'border-solid border-border bg-surface-hover text-fg',
    'aria-expanded:border-solid aria-expanded:border-primary aria-expanded:text-strong'
  );
}

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
      className={cn(
        'TaskManager',
        showPageLayout && 'TaskManager--page max-w-320',
        'flex min-w-0 flex-col',
        props.className
      )}
    >
      <form
        className="TaskManager__composer grid items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface py-2 pr-2 pl-4 shadow-sm focus-within:border-border-strong md:gap-y-0 md:py-1"
        onSubmit={(e) => onSubmit(e)}
      >
        <IconPlus
          className="TaskManager__composer__icon size-4.5 text-subtle"
          strokeWidth="2"
        />
        <input
          className="TaskManager__composer__title m-0 h-control-md min-w-0 appearance-none border-0 bg-transparent p-0 font-sans text-base font-medium text-fg outline-none placeholder:font-normal placeholder:text-subtle"
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
            'TaskManager__composer__drawer grid',
            descriptionOpen && 'TaskManager__composer__drawer--open'
          )}
          aria-hidden={!descriptionOpen}
        >
          <div className="TaskManager__composer__drawer__inner min-h-0 overflow-hidden pr-2 pl-7.5">
            <textarea
              className="TaskManager__composer__description my-1 box-border block max-h-60 min-h-15 w-full resize-none appearance-none border-0 bg-transparent p-0 font-sans text-base leading-5 text-fg outline-none field-sizing-content placeholder:text-subtle"
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
        <div className="TaskManager__composer__controls flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Popover
            withArrow
            label="Assign task"
            open={assignPopoverOpen}
            onOpenChange={setAssignPopoverOpen}
            placement="bottom"
            width={280}
            trigger={
              <button
                className={composerControlClasses(Boolean(assigneeEmail))}
                type="button"
              >
                {assigneeEmail ? (
                  <UserAvatar
                    email={assigneeEmail}
                    size={16}
                    withTooltip={false}
                  />
                ) : (
                  <IconUser className="size-3.5 shrink-0" strokeWidth="2" />
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
            placement="bottom"
            trigger={
              <button
                className={composerControlClasses(priority !== 'normal')}
                type="button"
              >
                <IconFlag className="size-3.5 shrink-0" strokeWidth="2" />
                <span>
                  {priority === 'normal'
                    ? 'Priority'
                    : formatTaskPriorityLabel(priority)}
                </span>
              </button>
            }
          >
            {(['high', 'medium', 'normal'] as TaskPriority[]).map((option) => (
              <MenuItem
                key={option}
                className={joinClassNames(
                  priority === option &&
                    'TaskManager__composer__menuItem--active font-bold'
                )}
                onClick={() => setPriority(option)}
              >
                {formatTaskPriorityLabel(option)}
              </MenuItem>
            ))}
          </Menu>
          <Popover
            withArrow
            label="Target date"
            open={targetDatePopoverOpen}
            onOpenChange={(open) =>
              open ? openTargetDatePopover() : closeTargetDatePopover()
            }
            placement="bottom"
            width={300}
            trigger={
              <button
                className={composerControlClasses(Boolean(targetLaunch))}
                type="button"
              >
                <IconCalendar className="size-3.5 shrink-0" strokeWidth="2" />
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
          className="TaskManager__composer__submit rounded-lg"
          type="submit"
          variant="primary"
          loading={creating}
          disabled={!canCreate}
        >
          Create
        </Button>
      </form>

      <div className="TaskManager__listHeader mt-6 mb-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          className="TaskManager__filters max-w-full"
          aria-label="Task filters"
          size="md"
          value={filter}
          onValueChange={(value: TaskFilter) => setFilter(value)}
          data={filterOptions.map((option) => ({
            value: option.value,
            label: (
              <span className="TaskManager__filter flex items-center justify-center gap-1.5 whitespace-nowrap">
                {option.label}
                {!loading && (
                  <span className="TaskManager__filter__count rounded-full bg-chip px-1.5 text-xs leading-4 text-muted">
                    {filterCounts[option.value] ?? 0}
                  </span>
                )}
              </span>
            ),
          }))}
        />
        <div className="TaskManager__listHeader__actions flex flex-wrap items-center gap-2.5">
          {showPageLayout ? (
            <>
              <TaskSortMenu value={sort} onChange={setSort} />
              <SegmentedControl
                className="TaskManager__layoutToggle shrink-0"
                aria-label="Task layout"
                size="md"
                value={layout}
                onValueChange={(value: TaskLayout) => setLayout(value)}
                data={TASK_LAYOUT_OPTIONS}
              />
            </>
          ) : (
            <Button href="/cms/tasks" size="xs">
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
      placement="bottom-end"
      trigger={
        <Button
          // Matches the original toggle: a light border and no shadow.
          className="TaskManager__sortToggle rounded-lg border-border font-normal shadow-none"
          size="md"
          icon={<IconArrowsSort strokeWidth="1.8" />}
          aria-label={`Sort by ${current.label.toLowerCase()}`}
        >
          {current.label}
        </Button>
      }
    >
      <MenuGroup label="Sort by">
        {TASK_SORT_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            icon={
              <IconCheck
                strokeWidth="2"
                className={joinClassNames(
                  option.value !== props.value && 'invisible'
                )}
              />
            }
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuGroup>
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
  const listClasses = 'TaskManager__list min-h-14';
  const stateClasses =
    'TaskManager__list__state flex min-h-18 items-center justify-center p-5 text-base text-muted';
  if (loading) {
    return (
      <Surface className={listClasses}>
        <div className={stateClasses}>
          <Spinner label="Loading tasks" />
        </div>
      </Surface>
    );
  }
  if (error) {
    return (
      <Surface className={listClasses}>
        <div
          className={cn(
            stateClasses,
            'TaskManager__list__state--error text-danger'
          )}
        >
          {error}
        </div>
      </Surface>
    );
  }
  if (tasks.length === 0) {
    return (
      <Surface className={listClasses}>
        <div className={stateClasses}>
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
    <Surface className={cn(listClasses, 'divide-y divide-border')}>
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
    <div className="TaskManager__groups flex flex-col gap-5">
      {columns.map((column) => {
        const columnTasks = props.tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        if (columnTasks.length === 0) {
          return null;
        }
        return (
          <Surface className="TaskManager__group rounded-xl" key={column.value}>
            <div
              className={cn(
                'TaskManager__group__header',
                `TaskManager__group__header--${column.value}`,
                'flex items-center gap-2.5 border-b border-border px-4 py-2.5',
                getTaskStatusBgClass(column.value)
              )}
            >
              <TaskStatusRing status={column.value} />
              <h2 className="TaskManager__group__title m-0 text-sm font-semibold leading-snug">
                {column.label}
              </h2>
              <span className="TaskManager__group__count text-sm text-muted">
                {columnTasks.length}
              </span>
            </div>
            <div className="TaskManager__group__rows divide-y divide-border">
              {columnTasks.map((task) => (
                <TaskListRow key={task.id} task={task} />
              ))}
            </div>
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
    <a
      className="TaskManager__listRow group flex min-h-12 items-center gap-3 px-4 text-base text-inherit no-underline hover:bg-surface-hover"
      href={`/cms/tasks/${task.id}`}
    >
      {task.assignee ? (
        <UserAvatar email={task.assignee} size={24} />
      ) : (
        <UnassignedAvatar />
      )}
      <span className="TaskManager__listRow__content flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="TaskManager__listRow__title truncate font-medium underline-offset-3 group-hover:underline">
          {task.title}
        </span>
        <span className="TaskManager__listRow__id whitespace-nowrap text-sm text-muted">
          #{task.id}
        </span>
      </span>
      <span className="TaskManager__listRow__priority flex shrink-0 md:w-18">
        <TaskPriorityBadge priority={priority} />
      </span>
      <span className="TaskManager__listRow__date hidden w-28 shrink-0 whitespace-nowrap text-right text-sm text-muted md:block">
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

/** Gradient for each priority badge, matching the doc status badges. */
const TASK_PRIORITY_GRADIENTS: Record<TaskPriority, BadgeGradient> = {
  high: 'red',
  medium: 'orange',
  normal: 'blue',
};

/** Renders a gradient pill for a task's priority. */
export function TaskPriorityBadge(props: {priority: TaskPriority}) {
  return (
    <Badge
      variant="gradient"
      gradient={TASK_PRIORITY_GRADIENTS[props.priority]}
      className={joinClassNames(
        'TaskManager__priorityBadge',
        `TaskManager__priorityBadge--${props.priority}`
      )}
    >
      {props.priority}
    </Badge>
  );
}

/** Renders a small ring icon that reflects a task's status. */
export function TaskStatusRing(props: {status: string}) {
  return (
    <span
      className={`TaskManager__statusRing TaskManager__statusRing--${props.status} box-border size-3.5 shrink-0 rounded-full`}
      aria-hidden="true"
    />
  );
}

/** A dashed circle shown in place of an avatar for unassigned tasks. */
function UnassignedAvatar(props: {smallIcon?: boolean}) {
  return (
    <span
      className="TaskManager__listRow__unassigned box-border flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-subtle"
      title="Unassigned"
      aria-label="Unassigned"
    >
      <IconUser
        className={props.smallIcon ? 'size-3' : 'size-3.5'}
        strokeWidth="2"
      />
    </span>
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
    <div className="TaskManager__board grid grid-flow-col items-stretch gap-4 overflow-x-auto pb-1">
      {columns.map((column) => {
        const columnTasks = tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        return (
          <section
            className={cn(
              'TaskManager__boardColumn',
              `TaskManager__boardColumn--${column.value}`,
              'flex min-h-120 flex-col gap-2.5 rounded-xl p-3 outline-2 -outline-offset-2 outline-transparent outline-dashed transition-colors',
              getTaskStatusBgClass(column.value),
              dropTarget === column.value &&
                'TaskManager__boardColumn--dropTarget outline-subtle'
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
            <div className="TaskManager__boardColumn__header flex items-center gap-2 px-1 pt-0.5 pb-1">
              <TaskStatusRing status={column.value} />
              <h2 className="TaskManager__boardColumn__title m-0 text-sm font-semibold">
                {column.label}
              </h2>
              <span className="TaskManager__boardColumn__count text-sm text-muted">
                {columnTasks.length}
              </span>
            </div>
            <div className="TaskManager__boardColumn__tasks flex flex-1 flex-col gap-2.5">
              {columnTasks.length === 0 && (
                <div className="TaskManager__boardColumn__empty flex min-h-22 flex-1 items-center justify-center text-sm text-muted">
                  No tasks
                </div>
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
        'flex cursor-grab flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5 text-strong no-underline shadow-sm transition-shadow hover:shadow-md',
        props.dragging && 'TaskManager__boardCard--dragging opacity-40'
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
      <div className="TaskManager__boardCard__header flex items-center justify-between gap-2">
        <span className="TaskManager__boardCard__id text-sm text-muted">
          #{task.id}
        </span>
        <TaskPriorityBadge priority={formatTaskPriority(task.priority)} />
      </div>
      <div className="TaskManager__boardCard__title text-base font-semibold leading-snug">
        {task.title}
      </div>
      {task.description && (
        <div className="TaskManager__boardCard__description line-clamp-3 text-sm leading-snug text-muted">
          {task.description}
        </div>
      )}
      <div className="TaskManager__boardCard__footer flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="TaskManager__boardCard__date min-w-0 text-sm text-muted *:gap-1.5">
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
          <UnassignedAvatar smallIcon />
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
    <a
      className="TaskManager__taskRow flex min-h-16 flex-col gap-2 px-4 py-3 text-inherit no-underline hover:bg-surface-hover active:bg-surface-active md:flex-row md:items-center md:gap-4"
      href={`/cms/tasks/${task.id}`}
    >
      <div className="TaskManager__taskRow__main flex min-w-0 flex-1 items-start gap-4 md:items-center">
        <div className="TaskManager__taskRow__avatar flex size-7 shrink-0 items-center justify-center rounded-full bg-chip">
          {task.assignee && <UserAvatar email={task.assignee} size={28} />}
        </div>
        <div className="TaskManager__taskRow__content min-w-0 flex-1">
          <div className="TaskManager__taskRow__title truncate text-base font-bold leading-snug">
            {task.title}
          </div>
          <div className="TaskManager__taskRow__meta mt-0.5 truncate font-mono text-sm leading-snug text-muted">
            opened {formatTaskDate(task.createdAt)} by{' '}
            <UserTag email={createdBy} />
          </div>
        </div>
      </div>
      <div className="TaskManager__taskRow__badges flex flex-wrap items-center gap-2 pl-11 md:justify-end md:pl-0">
        <div className="TaskManager__taskRow__status inline-flex min-h-6.5 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-chip px-3 font-mono text-sm font-bold lowercase leading-none text-fg">
          <span className="size-1.5 rounded-full bg-current"></span>
          {formatTaskStatus(task.status)}
        </div>
        <TaskPriorityBadge priority={formatTaskPriority(task.priority)} />
        {targetLaunch && (
          <div className="TaskManager__taskRow__date inline-flex min-h-6.5 items-center whitespace-nowrap rounded-full bg-surface-hover px-3 font-mono text-sm font-bold leading-none text-muted">
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
