import {Timestamp} from 'firebase/firestore';
import {describe, expect, it} from 'vitest';
import {
  getBlockingTasks,
  getSubtaskProgress,
  getSubtasks,
  getTaskDueDate,
  isTaskBlocked,
  isTaskOverdue,
  parseTaskCustomFieldKey,
  searchTasks,
  sortTasks,
  Task,
  taskCustomFieldKey,
} from './tasks.js';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    createdAt: Timestamp.fromMillis(1000),
    createdBy: 'author@example.com',
    ...overrides,
  };
}

describe('getTaskDueDate', () => {
  it('prefers dueDate', () => {
    const dueDate = Timestamp.fromMillis(2000);
    const legacy = Timestamp.fromMillis(9000);
    expect(
      getTaskDueDate(task('1', {dueDate, targetLaunchDate: legacy}))
    ).toEqual(dueDate);
  });

  it('falls back to targetLaunchDate for tasks written before dueDate', () => {
    const legacy = Timestamp.fromMillis(9000);
    expect(getTaskDueDate(task('1', {targetLaunchDate: legacy}))).toEqual(
      legacy
    );
  });

  it('returns null when neither is set', () => {
    expect(getTaskDueDate(task('1'))).toBeNull();
  });
});

describe('isTaskOverdue', () => {
  const past = Timestamp.fromMillis(1000);
  const future = Timestamp.fromMillis(9000);

  it('flags an open task past its due date', () => {
    expect(isTaskOverdue(task('1', {dueDate: past}), 5000)).toBe(true);
  });

  it('does not flag a task due in the future', () => {
    expect(isTaskOverdue(task('1', {dueDate: future}), 5000)).toBe(false);
  });

  it('never flags a closed task', () => {
    const closed = task('1', {dueDate: past, status: 'closed'});
    expect(isTaskOverdue(closed, 5000)).toBe(false);
  });

  it('does not flag a task with no due date', () => {
    expect(isTaskOverdue(task('1'), 5000)).toBe(false);
  });
});

describe('subtasks', () => {
  const tasks = [
    task('1'),
    task('2', {parentId: '1', createdAt: Timestamp.fromMillis(3000)}),
    task('3', {
      parentId: '1',
      status: 'closed',
      createdAt: Timestamp.fromMillis(2000),
    }),
    task('4', {parentId: '9'}),
  ];

  it('returns direct children oldest first', () => {
    expect(getSubtasks(tasks, '1').map((t) => t.id)).toEqual(['3', '2']);
  });

  it('counts completed subtasks', () => {
    expect(getSubtaskProgress(tasks, '1')).toEqual({completed: 1, total: 2});
  });

  it('reports zero progress for a task with no subtasks', () => {
    expect(getSubtaskProgress(tasks, '2')).toEqual({completed: 0, total: 0});
  });
});

describe('blocking tasks', () => {
  it('ignores blockers that are already closed', () => {
    const tasks = [
      task('1', {blockedBy: ['2', '3']}),
      task('2', {status: 'closed'}),
      task('3', {status: 'in-progress'}),
    ];
    expect(getBlockingTasks(tasks[0], tasks).map((t) => t.id)).toEqual(['3']);
    expect(isTaskBlocked(tasks[0], tasks)).toBe(true);
  });

  it('is unblocked once every blocker closes', () => {
    const tasks = [task('1', {blockedBy: ['2']}), task('2', {status: 'done'})];
    expect(isTaskBlocked(tasks[0], tasks)).toBe(false);
  });

  it('ignores blocker ids that no longer exist', () => {
    const tasks = [task('1', {blockedBy: ['missing']})];
    expect(isTaskBlocked(tasks[0], tasks)).toBe(false);
  });
});

describe('searchTasks', () => {
  const tasks = [
    task('1', {title: 'Fix the header', tags: ['bug', 'nav']}),
    task('2', {
      title: 'Launch page',
      description: 'Ship the homepage refresh',
      assignee: 'dana@example.com',
    }),
    task('3', {title: 'Header audit', fields: {surface: 'marketing'}}),
  ];

  it('returns everything for an empty query', () => {
    expect(searchTasks(tasks, '   ')).toHaveLength(3);
  });

  it('matches on title', () => {
    expect(searchTasks(tasks, 'header').map((t) => t.id)).toEqual(['1', '3']);
  });

  it('matches on description, tags, assignee, and custom field values', () => {
    expect(searchTasks(tasks, 'homepage').map((t) => t.id)).toEqual(['2']);
    expect(searchTasks(tasks, 'nav').map((t) => t.id)).toEqual(['1']);
    expect(searchTasks(tasks, 'dana').map((t) => t.id)).toEqual(['2']);
    expect(searchTasks(tasks, 'marketing').map((t) => t.id)).toEqual(['3']);
  });

  it('matches the task id, with or without the hash', () => {
    expect(searchTasks(tasks, '#2').map((t) => t.id)).toEqual(['2']);
  });

  it('requires every term to match', () => {
    expect(searchTasks(tasks, 'header audit').map((t) => t.id)).toEqual(['3']);
    expect(searchTasks(tasks, 'header nonexistent')).toHaveLength(0);
  });
});

describe('sortTasks', () => {
  it('sorts by priority, highest first', () => {
    const tasks = [
      task('1', {priority: 'normal'}),
      task('2', {priority: 'high'}),
      task('3', {priority: 'medium'}),
    ];
    expect(sortTasks(tasks, 'priority', 'asc').map((t) => t.id)).toEqual([
      '2',
      '3',
      '1',
    ]);
  });

  it('sorts by due date and pushes undated tasks last in both directions', () => {
    const tasks = [
      task('1', {dueDate: Timestamp.fromMillis(3000)}),
      task('2'),
      task('3', {dueDate: Timestamp.fromMillis(1000)}),
    ];
    expect(sortTasks(tasks, 'dueDate', 'asc').map((t) => t.id)).toEqual([
      '3',
      '1',
      '2',
    ]);
    expect(sortTasks(tasks, 'dueDate', 'desc').map((t) => t.id)).toEqual([
      '1',
      '3',
      '2',
    ]);
  });

  it('sorts by title alphabetically', () => {
    const tasks = [
      task('1', {title: 'Charlie'}),
      task('2', {title: 'alpha'}),
      task('3', {title: 'Bravo'}),
    ];
    expect(sortTasks(tasks, 'title', 'asc').map((t) => t.id)).toEqual([
      '2',
      '3',
      '1',
    ]);
  });

  it('does not mutate the input array', () => {
    const tasks = [task('1', {title: 'b'}), task('2', {title: 'a'})];
    sortTasks(tasks, 'title', 'asc');
    expect(tasks.map((t) => t.id)).toEqual(['1', '2']);
  });
});

describe('custom field keys', () => {
  it('round-trips a field id', () => {
    expect(parseTaskCustomFieldKey(taskCustomFieldKey('requestType'))).toBe(
      'requestType'
    );
  });

  it('returns null for built-in fields', () => {
    expect(parseTaskCustomFieldKey('assignee')).toBeNull();
  });
});
