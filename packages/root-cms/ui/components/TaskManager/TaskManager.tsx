import './TaskManager.css';

import {
  ActionIcon,
  Button,
  Loader,
  Menu,
  Popover,
  SegmentedControl,
  Table,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconColumns3,
  IconFlag,
  IconSearch,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTable,
  IconUserPlus,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  createTask,
  getSubtaskProgress,
  getTaskDueDate,
  isOpenTaskStatus,
  isTaskBlocked,
  isTaskOverdue,
  normalizeTaskStatus,
  searchTasks,
  sortTasks,
  subscribeOpenTasks,
  subscribeTaskFieldDefs,
  subscribeTasks,
  Task,
  TaskFieldDef,
  TaskPriority,
  TaskSortDirection,
  TaskSortKey,
  updateTaskStatus,
} from '../../utils/tasks.js';
import {Surface} from '../Surface/Surface.js';
import {TaskFieldValueDisplay} from '../TaskFieldInput/TaskFieldInput.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';

type TaskFilter =
  | 'open'
  | 'all'
  | 'closed'
  | 'assigned-to-me'
  | 'created-by-me';
type TaskLayout = 'table' | 'board';
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
    value: 'table',
    label: (
      <span className="TaskManager__layoutOption">
        <IconTable size={14} strokeWidth="1.8" />
        Table
      </span>
    ),
  },
  {
    value: 'board',
    label: (
      <span className="TaskManager__layoutOption">
        <IconColumns3 size={14} strokeWidth="1.8" />
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
  const fieldDefs = useTaskFieldDefs();
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{
    key: TaskSortKey;
    direction: TaskSortDirection;
  }>({key: 'created', direction: 'desc'});
  const [showSubtasks, setShowSubtasks] = useLocalStorage<boolean>(
    'root-cms-task-manager-show-subtasks',
    false
  );
  const [layout, setLayout] = useLocalStorage<TaskLayout>(
    'root-cms-task-manager-layout-v2',
    'table'
  );
  const [draft, setDraft] = useState('');
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
    let nextTasks = filterTasks(tasks, filter, currentUserEmail);
    // Subtasks are listed on their parent's page; showing them here too
    // double-counts the work, so they're hidden unless asked for.
    if (!showSubtasks) {
      nextTasks = nextTasks.filter((task) => !task.parentId);
    }
    nextTasks = searchTasks(nextTasks, query);
    return sortTasks(nextTasks, sort.key, sort.direction);
  }, [tasks, filter, currentUserEmail, showSubtasks, query, sort]);
  const taskCount = visibleTasks.length;
  const taskCountLabel = showPageLayout
    ? `${taskCount} shown`
    : `${taskCount} active`;
  const canCreate = Boolean(draft.trim()) && !creating;

  async function onSubmit(e: Event) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) {
      return;
    }
    const taskDraft = parseTaskDraft(content);
    setCreating(true);
    try {
      await createTask({
        title: taskDraft.title,
        description: taskDraft.description,
        assignee: assigneeEmail.trim() || undefined,
        priority,
        dueDate: parseTargetLaunchDate(targetLaunchDate),
      });
      setDraft('');
      setAssigneeEmail('');
      setPriority('normal');
      setTargetLaunchDate('');
      showNotification({
        title: 'Task created',
        message: taskDraft.title,
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
      <Surface className="TaskManager__composer">
        <form onSubmit={(e) => onSubmit(e)}>
          <div className="TaskManager__composer__header">
            <div className="TaskManager__composer__avatar">
              {assigneeEmail && <UserAvatar email={assigneeEmail} size={32} />}
            </div>
            <div>
              <div className="TaskManager__composer__title">Create a task</div>
              <div className="TaskManager__composer__subtitle">
                Assign it to an agent, a teammate, or yourself.
              </div>
            </div>
          </div>
          <textarea
            className="TaskManager__composer__textarea"
            value={draft}
            rows={3}
            placeholder="Enter a task description. Specify scope, collection, and acceptance criteria."
            onInput={(e) => {
              setDraft((e.currentTarget as HTMLTextAreaElement).value);
            }}
          />
          <div className="TaskManager__composer__footer">
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
                    className="TaskManager__composer__control"
                    type="button"
                    aria-expanded={assignPopoverOpen}
                    onClick={() => setAssignPopoverOpen(!assignPopoverOpen)}
                  >
                    <IconUserPlus size={15} strokeWidth="1.8" />
                    <span>assign to...</span>
                    {assigneeEmail && (
                      <span className="TaskManager__composer__control__value">
                        {formatTaskUser(assigneeEmail)}
                      </span>
                    )}
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
                    className="TaskManager__composer__control"
                    type="button"
                  >
                    <IconFlag size={15} strokeWidth="1.8" />
                    <span>{priority}</span>
                    <IconChevronDown size={14} strokeWidth="1.8" />
                  </button>
                }
              >
                {(['high', 'medium', 'normal'] as TaskPriority[]).map(
                  (option) => (
                    <Menu.Item
                      key={option}
                      className={
                        priority === option
                          ? 'TaskManager__composer__menuItem--active'
                          : ''
                      }
                      onClick={() => setPriority(option)}
                    >
                      {option}
                    </Menu.Item>
                  )
                )}
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
                    className="TaskManager__composer__control"
                    type="button"
                    aria-expanded={targetDatePopoverOpen}
                    onClick={() =>
                      setTargetDatePopoverOpen(!targetDatePopoverOpen)
                    }
                  >
                    <IconCalendar size={15} strokeWidth="1.8" />
                    <span>
                      {targetLaunchDate
                        ? formatTargetLaunchDateLabel(targetLaunchDate)
                        : 'due date'}
                    </span>
                  </button>
                }
              >
                <div className="TaskManager__composer__popover">
                  <label className="TaskManager__composer__dateLabel">
                    Due date
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
              type="submit"
              size="xs"
              color="dark"
              loading={creating}
              disabled={!canCreate}
              rightIcon={<IconArrowRight size={15} strokeWidth="1.8" />}
            >
              Create task
            </Button>
          </div>
        </form>
      </Surface>

      <div className="TaskManager__listHeader">
        <div className="TaskManager__listHeader__summary">
          <div className="TaskManager__listHeader__titleLine">
            <div className="TaskManager__sectionTitle">
              {showPageLayout ? 'Tasks' : 'Active tasks'}
            </div>
            <span className="TaskManager__listHeader__count">
              {taskCountLabel}
            </span>
          </div>
          <div className="TaskManager__filters" aria-label="Task filters">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={filter === option.value ? 'active' : ''}
                type="button"
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="TaskManager__listHeader__actions">
          <TextInput
            className="TaskManager__search"
            size="xs"
            type="search"
            value={query}
            placeholder="Search tasks..."
            aria-label="Search tasks"
            icon={<IconSearch size={14} strokeWidth="1.8" />}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setQuery(e.currentTarget.value)
            }
          />
          {showPageLayout && (
            <Button
              compact
              size="xs"
              variant={showSubtasks ? 'light' : 'default'}
              onClick={() => setShowSubtasks(!showSubtasks)}
            >
              {showSubtasks ? 'Hide subtasks' : 'Show subtasks'}
            </Button>
          )}
          {showPageLayout ? (
            <SegmentedControl
              className="TaskManager__layoutToggle"
              size="xs"
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
        allTasks={tasks}
        error={error}
        fieldDefs={fieldDefs}
        filter={filter}
        layout={showPageLayout ? layout : 'compact'}
        loading={loading}
        query={query}
        sort={sort}
        tasks={visibleTasks}
        onSortChange={setSort}
      />
    </div>
  );
}

interface TaskSortState {
  key: TaskSortKey;
  direction: TaskSortDirection;
}

interface TaskListContentProps {
  /** Every task, used for subtask rollups and blocker resolution. */
  allTasks: Task[];
  error: string;
  fieldDefs: TaskFieldDef[];
  filter: TaskFilter;
  layout: TaskListLayout;
  loading: boolean;
  query: string;
  sort: TaskSortState;
  tasks: Task[];
  onSortChange: (sort: TaskSortState) => void;
}

/** Renders the current task list view and shared loading states. */
function TaskListContent(props: TaskListContentProps) {
  const {allTasks, error, fieldDefs, filter, layout, loading, tasks} = props;
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
          {props.query
            ? `No tasks match "${props.query}".`
            : getEmptyTaskMessage(filter, layout)}
        </div>
      </Surface>
    );
  }
  if (layout === 'board') {
    return <TaskBoard allTasks={allTasks} filter={filter} tasks={tasks} />;
  }
  if (layout === 'table') {
    return (
      <TaskTable
        allTasks={allTasks}
        fieldDefs={fieldDefs}
        sort={props.sort}
        tasks={tasks}
        onSortChange={props.onSortChange}
      />
    );
  }
  return (
    <Surface className="TaskManager__list">
      {tasks.map((task) => (
        <TaskRow key={task.id} allTasks={allTasks} task={task} />
      ))}
    </Surface>
  );
}

/**
 * Toggles a task between its current status and closed, so the list has
 * the same one-click completion an Asana-style tracker does.
 */
async function toggleTaskComplete(task: Task) {
  try {
    await updateTaskStatus(
      task.id,
      isOpenTaskStatus(task.status) ? 'closed' : 'new'
    );
  } catch (err) {
    showNotification({
      title: 'Could not update task',
      message: errorMessage(err),
      color: 'red',
      autoClose: false,
    });
  }
}

/** One-click completion toggle shared by the list and table views. */
function TaskCompleteToggle(props: {task: Task}) {
  const {task} = props;
  const done = !isOpenTaskStatus(task.status);
  return (
    <Tooltip label={done ? 'Reopen task' : 'Mark complete'}>
      <ActionIcon
        className={joinClassNames(
          'TaskManager__completeToggle',
          done && 'TaskManager__completeToggle--done'
        )}
        size="sm"
        aria-label={done ? 'Reopen task' : 'Mark complete'}
        onClick={(e: MouseEvent) => {
          // The toggle sits inside the row's <a>; don't navigate.
          e.preventDefault();
          e.stopPropagation();
          toggleTaskComplete(task);
        }}
      >
        <IconCheck size={14} strokeWidth="2.2" />
      </ActionIcon>
    </Tooltip>
  );
}

/** Badges derived from other tasks: blocked state and subtask progress. */
function TaskRollupBadges(props: {task: Task; allTasks: Task[]}) {
  const {task, allTasks} = props;
  const blocked = isTaskBlocked(task, allTasks);
  const progress = getSubtaskProgress(allTasks, task.id);
  const overdue = isTaskOverdue(task);
  if (!blocked && progress.total === 0 && !overdue) {
    return null;
  }
  return (
    <>
      {blocked && (
        <span className="TaskManager__badge TaskManager__badge--blocked">
          <IconAlertTriangle size={11} strokeWidth="2" />
          blocked
        </span>
      )}
      {overdue && (
        <span className="TaskManager__badge TaskManager__badge--overdue">
          overdue
        </span>
      )}
      {progress.total > 0 && (
        <span className="TaskManager__badge">
          {progress.completed}/{progress.total} subtasks
        </span>
      )}
    </>
  );
}

/** A sortable table column header. */
function TaskSortHeader(props: {
  label: string;
  sortKey: TaskSortKey;
  sort: TaskSortState;
  onSortChange: (sort: TaskSortState) => void;
}) {
  const {label, sortKey, sort, onSortChange} = props;
  const active = sort.key === sortKey;
  return (
    <th>
      <button
        className={joinClassNames(
          'TaskManager__sortHeader',
          active && 'TaskManager__sortHeader--active'
        )}
        type="button"
        aria-sort={
          active
            ? sort.direction === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
        }
        onClick={() =>
          onSortChange({
            key: sortKey,
            // Re-clicking the active column flips it; a new column starts
            // in the direction that reads as "most relevant first".
            direction:
              active && sort.direction === 'desc'
                ? 'asc'
                : active
                  ? 'desc'
                  : 'asc',
          })
        }
      >
        {label}
        {active ? (
          sort.direction === 'asc' ? (
            <IconSortAscending size={12} strokeWidth="1.8" />
          ) : (
            <IconSortDescending size={12} strokeWidth="1.8" />
          )
        ) : (
          <IconSelector size={12} strokeWidth="1.8" />
        )}
      </button>
    </th>
  );
}

/** Renders tasks in a tabular layout. */
function TaskTable(props: {
  allTasks: Task[];
  fieldDefs: TaskFieldDef[];
  sort: TaskSortState;
  tasks: Task[];
  onSortChange: (sort: TaskSortState) => void;
}) {
  const {allTasks, sort, onSortChange} = props;
  const listFieldDefs = props.fieldDefs.filter(
    (fieldDef) => fieldDef.showInList
  );
  return (
    <Surface className="TaskManager__tableSurface">
      <Table
        className="TaskManager__table"
        verticalSpacing="xs"
        striped
        highlightOnHover
        fontSize="xs"
      >
        <thead>
          <tr>
            <th className="TaskManager__table__completeCol">
              <span className="TaskManager__srOnly">Complete</span>
            </th>
            <TaskSortHeader
              label="task"
              sortKey="title"
              sort={sort}
              onSortChange={onSortChange}
            />
            <TaskSortHeader
              label="status"
              sortKey="status"
              sort={sort}
              onSortChange={onSortChange}
            />
            <TaskSortHeader
              label="priority"
              sortKey="priority"
              sort={sort}
              onSortChange={onSortChange}
            />
            <TaskSortHeader
              label="assignee"
              sortKey="assignee"
              sort={sort}
              onSortChange={onSortChange}
            />
            <TaskSortHeader
              label="due"
              sortKey="dueDate"
              sort={sort}
              onSortChange={onSortChange}
            />
            {listFieldDefs.map((fieldDef) => (
              <th key={fieldDef.id}>{fieldDef.label.toLowerCase()}</th>
            ))}
            <TaskSortHeader
              label="opened"
              sortKey="created"
              sort={sort}
              onSortChange={onSortChange}
            />
          </tr>
        </thead>
        <tbody>
          {props.tasks.map((task) => {
            const createdBy = task.createdBy || 'unknown';
            const dueDate = getTaskDueDate(task);
            return (
              <tr key={task.id}>
                <td className="TaskManager__table__completeCol">
                  <TaskCompleteToggle task={task} />
                </td>
                <td>
                  <a
                    className="TaskManager__tableTask"
                    href={`/cms/tasks/${task.id}`}
                  >
                    <div className="TaskManager__taskRow__avatar">
                      {task.assignee && (
                        <UserAvatar email={task.assignee} size={24} />
                      )}
                    </div>
                    <span className="TaskManager__tableTask__content">
                      <span className="TaskManager__tableTask__title">
                        {task.title}
                      </span>
                      <span className="TaskManager__tableTask__meta">
                        #{task.id} by {formatTaskUser(createdBy)}
                        {task.parentId && (
                          <span> · subtask of #{task.parentId}</span>
                        )}
                      </span>
                      <span className="TaskManager__tableTask__badges">
                        <TaskRollupBadges task={task} allTasks={allTasks} />
                        {(task.tags || []).map((tag) => (
                          <span className="TaskManager__badge" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </span>
                    </span>
                  </a>
                </td>
                <td>
                  <span className="TaskManager__taskRow__status">
                    <span></span>
                    {formatTaskStatus(task.status)}
                  </span>
                </td>
                <td>
                  <span
                    className={`TaskManager__taskRow__priority TaskManager__taskRow__priority--${formatTaskPriority(
                      task.priority
                    )}`}
                  >
                    {formatTaskPriority(task.priority)}
                  </span>
                </td>
                <td>
                  {task.assignee ? formatTaskUser(task.assignee) : 'Unassigned'}
                </td>
                <td
                  className={joinClassNames(
                    isTaskOverdue(task) && 'TaskManager__table__overdue'
                  )}
                >
                  {dueDate ? formatTaskDate(dueDate) : 'None'}
                </td>
                {listFieldDefs.map((fieldDef) => (
                  <td key={fieldDef.id}>
                    <TaskFieldValueDisplay
                      fieldDef={fieldDef}
                      value={task.fields?.[fieldDef.id] ?? null}
                    />
                  </td>
                ))}
                <td>{formatTaskDate(task.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Surface>
  );
}

/** Renders tasks grouped by status in a board. */
function TaskBoard(props: {
  allTasks: Task[];
  filter: TaskFilter;
  tasks: Task[];
}) {
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
                <TaskBoardCard
                  key={task.id}
                  allTasks={props.allTasks}
                  task={task}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Renders a single task card for the board. */
function TaskBoardCard(props: {allTasks: Task[]; task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  const dueDate = getTaskDueDate(task);
  return (
    <a className="TaskManager__boardCard" href={`/cms/tasks/${task.id}`}>
      <div className="TaskManager__boardCard__header">
        <TaskCompleteToggle task={task} />
        <div className="TaskManager__boardCard__title">{task.title}</div>
      </div>
      {task.description && (
        <div className="TaskManager__boardCard__description">
          {task.description}
        </div>
      )}
      <div className="TaskManager__boardCard__meta">
        #{task.id} opened {formatTaskDate(task.createdAt)} by{' '}
        {formatTaskUser(createdBy)}
      </div>
      <div className="TaskManager__boardCard__badges">
        <span
          className={`TaskManager__taskRow__priority TaskManager__taskRow__priority--${formatTaskPriority(
            task.priority
          )}`}
        >
          {formatTaskPriority(task.priority)}
        </span>
        <span className="TaskManager__boardCard__badge">
          {task.assignee ? formatTaskUser(task.assignee) : 'Unassigned'}
        </span>
        {dueDate && (
          <span
            className={joinClassNames(
              'TaskManager__boardCard__badge',
              isTaskOverdue(task) && 'TaskManager__badge--overdue'
            )}
          >
            due {formatTaskDate(dueDate)}
          </span>
        )}
        <TaskRollupBadges task={task} allTasks={props.allTasks} />
      </div>
    </a>
  );
}

function parseTaskDraft(content: string) {
  const [titleLine, ...descriptionLines] = content.split('\n');
  while (
    descriptionLines.length > 0 &&
    descriptionLines[0].trim().length === 0
  ) {
    descriptionLines.shift();
  }
  return {
    title: titleLine.trim(),
    description: descriptionLines.join('\n').trim(),
  };
}

function TaskRow(props: {allTasks: Task[]; task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  const dueDate = getTaskDueDate(task);
  return (
    <a className="TaskManager__taskRow" href={`/cms/tasks/${task.id}`}>
      <TaskCompleteToggle task={task} />
      <div className="TaskManager__taskRow__avatar">
        {task.assignee && <UserAvatar email={task.assignee} size={28} />}
      </div>
      <div className="TaskManager__taskRow__content">
        <div className="TaskManager__taskRow__title">{task.title}</div>
        <div className="TaskManager__taskRow__meta">
          opened {formatTaskDate(task.createdAt)} by {formatTaskUser(createdBy)}
        </div>
      </div>
      <div className="TaskManager__taskRow__badges">
        <TaskRollupBadges task={task} allTasks={props.allTasks} />
        <div className="TaskManager__taskRow__status">
          <span></span>
          {formatTaskStatus(task.status)}
        </div>
        <div
          className={`TaskManager__taskRow__priority TaskManager__taskRow__priority--${formatTaskPriority(
            task.priority
          )}`}
        >
          {formatTaskPriority(task.priority)}
        </div>
        {dueDate && (
          <div
            className={joinClassNames(
              'TaskManager__taskRow__date',
              isTaskOverdue(task) && 'TaskManager__badge--overdue'
            )}
          >
            due {formatTaskDate(dueDate)}
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

/** Subscribes to the project's custom task field definitions. */
function useTaskFieldDefs() {
  const [fieldDefs, setFieldDefs] = useState<TaskFieldDef[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeTaskFieldDefs(
      (nextFieldDefs) => setFieldDefs(nextFieldDefs),
      (err) => console.error('failed to load task fields:', err)
    );
    return () => unsubscribe();
  }, []);
  return fieldDefs;
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
    return 'due date';
  }
  return date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}
