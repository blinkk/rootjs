import './TaskManager.css';

import {Button, Loader, Menu, Popover, TextInput} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconArrowRight,
  IconCalendar,
  IconChevronDown,
  IconFlag,
  IconUserPlus,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  createTask,
  subscribeOpenTasks,
  Task,
  TaskPriority,
} from '../../utils/tasks.js';
import {Surface} from '../Surface/Surface.js';

type TaskFilter = 'all' | 'assigned-to-me';

export interface TaskManagerProps {
  className?: string;
}

/** Renders the task composer and open task list for CMS pages. */
export function TaskManager(props: TaskManagerProps) {
  const currentUserEmail = window.firebase.user.email || '';
  const {tasks, loading, error} = useOpenTasks();
  const [filter, setFilter] = useState<TaskFilter>('all');
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
    <div className={joinClassNames(props.className, 'TaskManager')}>
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
          <div className="TaskManager__sectionTitle">Open tasks</div>
          <span className="TaskManager__listHeader__count">
            {taskCount} active
          </span>
        </div>
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
      </div>

      <Surface className="TaskManager__list">
        {loading && (
          <div className="TaskManager__list__state">
            <Loader color="gray" size="sm" />
          </div>
        )}
        {!loading && error && (
          <div className="TaskManager__list__state error">{error}</div>
        )}
        {!loading && !error && visibleTasks.length === 0 && (
          <div className="TaskManager__list__state">
            {filter === 'assigned-to-me'
              ? 'No open tasks are assigned to you.'
              : 'No open tasks yet.'}
          </div>
        )}
        {!loading &&
          !error &&
          visibleTasks.map((task) => <TaskRow key={task.id} task={task} />)}
      </Surface>
    </div>
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

function useOpenTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeOpenTasks(
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
  }, []);

  return {tasks, loading, error};
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
