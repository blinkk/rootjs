import './TaskManager.css';

import {
  Button,
  Loader,
  Menu,
  Popover,
  SegmentedControl,
  Table,
  TextInput,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconArrowRight,
  IconCalendar,
  IconChevronDown,
  IconFlag,
  IconLayoutKanban,
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
  subscribeOpenTasks,
  subscribeTasks,
  Task,
  TaskPriority,
} from '../../utils/tasks.js';
import {Surface} from '../Surface/Surface.js';

type TaskFilter = 'all' | 'assigned-to-me';
type TaskLayout = 'table' | 'kanban';
type TaskListLayout = TaskLayout | 'compact';
type TaskManagerVariant = 'compact' | 'page';
type TaskScope = 'all' | 'open';

const TASK_STATUS_COLUMNS = [
  {value: 'open', label: 'Open'},
  {value: 'in-progress', label: 'In progress'},
  {value: 'blocked', label: 'Blocked'},
  {value: 'done', label: 'Done'},
  {value: 'closed', label: 'Closed'},
];

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
    value: 'kanban',
    label: (
      <span className="TaskManager__layoutOption">
        <IconLayoutKanban size={14} strokeWidth="1.8" />
        Kanban
      </span>
    ),
  },
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
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [layout, setLayout] = useLocalStorage<TaskLayout>(
    'root-cms-task-manager-layout',
    'table'
  );
  const [draft, setDraft] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [targetLaunchDate, setTargetLaunchDate] = useState('');
  const [targetDatePopoverOpen, setTargetDatePopoverOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const assignedToMeTasks = useMemo(() => {
    return tasks.filter((task) => task.assignee === currentUserEmail);
  }, [tasks, currentUserEmail]);

  const visibleTasks = filter === 'assigned-to-me' ? assignedToMeTasks : tasks;
  const taskCount = tasks.length;
  const taskCountLabel = showPageLayout
    ? `${taskCount} total`
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
        targetLaunchDate: parseTargetLaunchDate(targetLaunchDate),
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
              {getTaskAvatarLabel(currentUserEmail)}
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
                        : 'target launch date'}
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
        <div>
          <div className="TaskManager__sectionTitle">
            {showPageLayout ? 'Tasks' : 'Open tasks'}
          </div>
          <span className="TaskManager__listHeader__count">
            {taskCountLabel}
          </span>
        </div>
        <div className="TaskManager__listHeader__actions">
          <div className="TaskManager__filters" aria-label="Task filters">
            <button
              className={filter === 'all' ? 'active' : ''}
              type="button"
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={filter === 'assigned-to-me' ? 'active' : ''}
              type="button"
              onClick={() => setFilter('assigned-to-me')}
            >
              Assigned to me {assignedToMeTasks.length}
            </button>
          </div>
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
  if (layout === 'kanban') {
    return <TaskKanbanBoard tasks={tasks} />;
  }
  if (layout === 'table') {
    return <TaskTable tasks={tasks} />;
  }
  return (
    <Surface className="TaskManager__list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Surface>
  );
}

/** Renders tasks in a tabular layout. */
function TaskTable(props: {tasks: Task[]}) {
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
            <th>task</th>
            <th>status</th>
            <th>priority</th>
            <th>assignee</th>
            <th>target</th>
            <th>opened</th>
          </tr>
        </thead>
        <tbody>
          {props.tasks.map((task) => {
            const createdBy = task.createdBy || 'unknown';
            return (
              <tr key={task.id}>
                <td>
                  <a
                    className="TaskManager__tableTask"
                    href={`/cms/tasks/${task.id}`}
                  >
                    <div className="TaskManager__taskRow__avatar">
                      {getTaskAvatarLabel(
                        task.assignee || createdBy || task.title
                      )}
                    </div>
                    <span className="TaskManager__tableTask__content">
                      <span className="TaskManager__tableTask__title">
                        {task.title}
                      </span>
                      <span className="TaskManager__tableTask__meta">
                        #{task.id} by {formatTaskUser(createdBy)}
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
                <td>
                  {task.targetLaunchDate
                    ? formatTaskDate(task.targetLaunchDate)
                    : 'None'}
                </td>
                <td>{formatTaskDate(task.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Surface>
  );
}

/** Renders tasks grouped by status in a kanban board. */
function TaskKanbanBoard(props: {tasks: Task[]}) {
  const columns = getTaskStatusColumns(props.tasks);
  return (
    <div className="TaskManager__kanban">
      {columns.map((column) => {
        const columnTasks = props.tasks.filter(
          (task) => getTaskStatusValue(task) === column.value
        );
        return (
          <section className="TaskManager__kanbanColumn" key={column.value}>
            <div className="TaskManager__kanbanColumn__header">
              <span>{column.label}</span>
              <span>{columnTasks.length}</span>
            </div>
            <div className="TaskManager__kanbanColumn__tasks">
              {columnTasks.length === 0 && (
                <div className="TaskManager__kanbanColumn__empty">No tasks</div>
              )}
              {columnTasks.map((task) => (
                <TaskKanbanCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Renders a single task card for the kanban board. */
function TaskKanbanCard(props: {task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  return (
    <a className="TaskManager__kanbanCard" href={`/cms/tasks/${task.id}`}>
      <div className="TaskManager__kanbanCard__title">{task.title}</div>
      {task.description && (
        <div className="TaskManager__kanbanCard__description">
          {task.description}
        </div>
      )}
      <div className="TaskManager__kanbanCard__meta">
        #{task.id} opened {formatTaskDate(task.createdAt)} by{' '}
        {formatTaskUser(createdBy)}
      </div>
      <div className="TaskManager__kanbanCard__badges">
        <span
          className={`TaskManager__taskRow__priority TaskManager__taskRow__priority--${formatTaskPriority(
            task.priority
          )}`}
        >
          {formatTaskPriority(task.priority)}
        </span>
        <span className="TaskManager__kanbanCard__badge">
          {task.assignee ? formatTaskUser(task.assignee) : 'Unassigned'}
        </span>
        {task.targetLaunchDate && (
          <span className="TaskManager__kanbanCard__badge">
            target {formatTaskDate(task.targetLaunchDate)}
          </span>
        )}
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

function TaskRow(props: {task: Task}) {
  const {task} = props;
  const createdBy = task.createdBy || 'unknown';
  return (
    <a className="TaskManager__taskRow" href={`/cms/tasks/${task.id}`}>
      <div className="TaskManager__taskRow__avatar">
        {getTaskAvatarLabel(task.assignee || createdBy || task.title)}
      </div>
      <div className="TaskManager__taskRow__content">
        <div className="TaskManager__taskRow__title">{task.title}</div>
        <div className="TaskManager__taskRow__meta">
          opened {formatTaskDate(task.createdAt)} by {formatTaskUser(createdBy)}
          {task.assignee && <> - assigned to {formatTaskUser(task.assignee)}</>}
        </div>
      </div>
      <div className="TaskManager__taskRow__badges">
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

function getEmptyTaskMessage(filter: TaskFilter, layout: TaskListLayout) {
  if (filter === 'assigned-to-me') {
    return layout === 'compact'
      ? 'No open tasks are assigned to you.'
      : 'No tasks are assigned to you.';
  }
  return layout === 'compact' ? 'No open tasks yet.' : 'No tasks yet.';
}

function getTaskAvatarLabel(value: string) {
  const source =
    value
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .trim() || '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
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
  return (status || 'open').replace(/[-_]/g, ' ');
}

function getTaskStatusValue(task: Task) {
  return task.status?.trim() || 'open';
}

function getTaskStatusColumns(tasks: Task[]) {
  const knownStatuses = new Set(
    TASK_STATUS_COLUMNS.map((column) => column.value)
  );
  const customStatuses = tasks
    .map((task) => getTaskStatusValue(task))
    .filter((status) => !knownStatuses.has(status));
  return [
    ...TASK_STATUS_COLUMNS,
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
    return 'target launch date';
  }
  return date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}
