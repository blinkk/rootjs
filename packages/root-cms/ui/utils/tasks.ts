import {
  FieldPath,
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {RichTextData, RichTextBlock} from '../../shared/richtext.js';
import {logAction} from './actions.js';
import type {UploadedFile} from './gcs.js';

const TASK_COUNTER_ID = 'tasks';
const TASK_ID_ALLOCATION_ATTEMPTS = 20;

export interface Task {
  id: string;
  title: string;
  description?: string;
  /**
   * Rich-text description. `description` is kept in sync as the plain-text
   * projection so existing search/list code keeps working.
   */
  descriptionBody?: RichTextData | null;
  attachments?: TaskAttachment[];
  assignee?: string | null;
  /** Additional people following the task, beyond the assignee. */
  followers?: string[];
  priority?: TaskPriority;
  status?: string;
  tags?: string[];
  /** Values for the project's custom fields, keyed by `TaskFieldDef.id`. */
  fields?: Record<string, TaskFieldValue>;
  /** Parent task id, set when this task is a subtask. */
  parentId?: string | null;
  /** Ids of tasks that must be resolved before this one can proceed. */
  blockedBy?: string[];
  startDate?: Timestamp | null;
  dueDate?: Timestamp | null;
  /**
   * Retained for backwards compatibility. Kept in sync with `dueDate`; new
   * code should read `dueDate`.
   */
  targetLaunchDate?: Timestamp | null;
  /** Provenance for tasks imported from an external tracker. */
  source?: TaskSource | null;
  /** Display name of the original author, for imported tasks. */
  importedAuthor?: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export type TaskPriority = 'high' | 'medium' | 'normal';
export type TaskUnsubscribe = () => void;

export type TaskFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox';

export type TaskFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Timestamp
  | null;

export interface TaskFieldOption {
  value: string;
  label: string;
  /** Badge color for the option chip. */
  color?: string;
}

/**
 * A project-level custom field definition. Definitions live on the project
 * doc so a field can be rendered as a list column without extra reads.
 */
export interface TaskFieldDef {
  id: string;
  label: string;
  type: TaskFieldType;
  options?: TaskFieldOption[];
  /** Render this field as a column in the task list. */
  showInList?: boolean;
}

/** Points back at the task's record in an external tracker. */
export interface TaskSource {
  provider: string;
  url?: string;
  id?: string;
}

/**
 * Provenance for content migrated in from another tracker. `createdBy`
 * always records the authenticated account that performed the import, so
 * the audit trail can't be falsified; `author` is presentational only.
 */
export interface TaskImportOptions {
  createdAt?: Date | Timestamp;
  author?: string;
  source?: TaskSource;
}

export interface TaskAttachment extends UploadedFile {
  id: string;
  attachedAt: Timestamp;
  attachedBy: string;
  contentType?: string;
  size?: number;
}

export interface TaskCommentHistoryEntry {
  action: 'edit' | 'delete';
  content: string;
  body?: RichTextData | null;
  changedAt: Timestamp;
  changedBy: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  parentId?: string | null;
  content: string;
  body?: RichTextData | null;
  attachments?: TaskAttachment[];
  /** Lower-cased emails of users mentioned via `@<email>` in the content. */
  mentions?: string[];
  /** Display name of the original author, for imported comments. */
  importedAuthor?: string | null;
  /** Source tracker the comment was imported from. */
  source?: TaskSource | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
  deletedAt?: Timestamp;
  deletedBy?: string;
  isDeleted?: boolean;
  history?: TaskCommentHistoryEntry[];
}

/**
 * Fields tracked in the task timeline. Custom fields are tracked using a
 * `field:<TaskFieldDef.id>` key.
 */
export type TaskMetadataField =
  | 'title'
  | 'assignee'
  | 'followers'
  | 'priority'
  | 'status'
  | 'tags'
  | 'blockedBy'
  | 'parentId'
  | 'startDate'
  | 'dueDate'
  | 'targetLaunchDate'
  | `field:${string}`;

/** Values that can be recorded on either side of a timeline event. */
export type TaskEventValue = TaskFieldValue;

export interface TaskEvent {
  id: string;
  taskId: string;
  type: 'metadata';
  field: TaskMetadataField;
  oldValue: TaskEventValue;
  newValue: TaskEventValue;
  createdAt: Timestamp;
  createdBy: string;
}

/** Builds the timeline event key for a custom field. */
export function taskCustomFieldKey(fieldId: string): TaskMetadataField {
  return `field:${fieldId}`;
}

/** Returns the custom field id for a `field:<id>` event key, else null. */
export function parseTaskCustomFieldKey(field: string): string | null {
  return field.startsWith('field:') ? field.slice('field:'.length) : null;
}

function projectDocRef() {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId);
}

function taskDocRef(taskId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId, 'Tasks', taskId);
}

function taskCounterDocRef() {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId, 'Counters', TASK_COUNTER_ID);
}

function tasksCollectionRef() {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return collection(db, 'Projects', projectId, 'Tasks');
}

function taskCommentsCollectionRef(taskId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return collection(db, 'Projects', projectId, 'Tasks', taskId, 'Comments');
}

function taskCommentDocRef(taskId: string, commentId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId, 'Tasks', taskId, 'Comments', commentId);
}

function taskEventsCollectionRef(taskId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return collection(db, 'Projects', projectId, 'Tasks', taskId, 'Events');
}

function taskEventDocRef(taskId: string) {
  return doc(taskEventsCollectionRef(taskId));
}

async function getDefaultTaskAssignee(): Promise<string | null> {
  const snapshot = await getDoc(projectDocRef());
  if (!snapshot.exists()) {
    return null;
  }
  const data: any = snapshot.data() || {};
  return data.settings?.defaultAssignee || null;
}

export async function setDefaultTaskAssignee(assignee: string | null) {
  await updateDoc(
    projectDocRef(),
    new FieldPath('settings', 'defaultAssignee'),
    assignee
  );
  logAction('tasks.defaultAssignee', {
    metadata: {assignee: assignee || null},
  });
}

/**
 * Subscribes to the project's custom task field definitions. Definitions
 * live on the project doc so list columns cost no extra reads.
 */
export function subscribeTaskFieldDefs(
  onFieldDefs: (fieldDefs: TaskFieldDef[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    projectDocRef(),
    (snapshot) => {
      const data: any = snapshot.data() || {};
      onFieldDefs(normalizeTaskFieldDefs(data.settings?.taskFields));
    },
    onError
  );
}

export async function getTaskFieldDefs(): Promise<TaskFieldDef[]> {
  const snapshot = await getDoc(projectDocRef());
  const data: any = snapshot.data() || {};
  return normalizeTaskFieldDefs(data.settings?.taskFields);
}

/** Replaces the project's custom task field definitions. */
export async function setTaskFieldDefs(fieldDefs: TaskFieldDef[]) {
  const normalized = normalizeTaskFieldDefs(fieldDefs);
  await updateDoc(
    projectDocRef(),
    new FieldPath('settings', 'taskFields'),
    normalized
  );
  logAction('tasks.fieldDefs.update', {
    metadata: {count: normalized.length},
  });
}

function normalizeTaskFieldDefs(value: unknown): TaskFieldDef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const fieldDefs: TaskFieldDef[] = [];
  for (const item of value) {
    const id = String(item?.id || '').trim();
    const type = String(item?.type || '') as TaskFieldType;
    if (!id || seen.has(id) || !TASK_FIELD_TYPES.includes(type)) {
      continue;
    }
    seen.add(id);
    const fieldDef: TaskFieldDef = {
      id,
      label: String(item?.label || id),
      type,
      showInList: Boolean(item?.showInList),
    };
    if (type === 'select' || type === 'multiselect') {
      fieldDef.options = normalizeTaskFieldOptions(item?.options);
    }
    fieldDefs.push(fieldDef);
  }
  return fieldDefs;
}

function normalizeTaskFieldOptions(value: unknown): TaskFieldOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const options: TaskFieldOption[] = [];
  for (const item of value) {
    const optionValue = String(item?.value ?? '').trim();
    if (!optionValue || seen.has(optionValue)) {
      continue;
    }
    seen.add(optionValue);
    const option: TaskFieldOption = {
      value: optionValue,
      label: String(item?.label || optionValue),
    };
    if (item?.color) {
      option.color = String(item.color);
    }
    options.push(option);
  }
  return options;
}

const TASK_FIELD_TYPES: TaskFieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
];

export async function createTask(options: {
  title: string;
  description?: string;
  descriptionBody?: RichTextData | null;
  assignee?: string | null;
  followers?: string[];
  priority?: TaskPriority;
  status?: string;
  tags?: string[];
  fields?: Record<string, TaskFieldValue | Date>;
  parentId?: string | null;
  blockedBy?: string[];
  startDate?: Date | Timestamp | null;
  dueDate?: Date | Timestamp | null;
  /** @deprecated Use `dueDate`. Kept in sync for existing callers. */
  targetLaunchDate?: Date | Timestamp | null;
  source?: TaskSource | null;
  imported?: TaskImportOptions;
}) {
  if (!options.title) {
    throw new Error('missing task title');
  }

  const db = window.firebase.db;
  const assignee = options.assignee ?? (await getDefaultTaskAssignee());
  const priority = options.priority || 'normal';
  const status = options.status || 'new';
  const dueDate = normalizeTaskDate(
    options.dueDate ?? options.targetLaunchDate
  );
  // `targetLaunchDate` predates `dueDate`; keep both in sync so existing
  // list columns and queries keep working.
  const targetLaunchDate = dueDate;
  const startDate = normalizeTaskDate(options.startDate);
  const imported = options.imported;
  const createdAt = imported?.createdAt
    ? normalizeTaskDate(imported.createdAt)
    : null;
  const source = normalizeTaskSource(options.source ?? imported?.source);
  const taskId = await runTransaction(db, async (transaction) => {
    const counterRef = taskCounterDocRef();
    const counterSnapshot = await transaction.get(counterRef);
    const counterData = counterSnapshot.data() || {};
    const lastTaskId =
      typeof counterData.lastTaskId === 'number' ? counterData.lastTaskId : 0;
    let nextTaskId = Math.floor(lastTaskId) + 1;

    for (let i = 0; i < TASK_ID_ALLOCATION_ATTEMPTS; i++) {
      const taskRef = taskDocRef(String(nextTaskId));
      const taskSnapshot = await transaction.get(taskRef);
      if (!taskSnapshot.exists()) {
        transaction.set(
          counterRef,
          {
            lastTaskId: nextTaskId,
            updatedAt: serverTimestamp(),
          },
          {merge: true}
        );
        transaction.set(taskRef, {
          id: String(nextTaskId),
          title: options.title,
          description: options.description || '',
          descriptionBody: options.descriptionBody || null,
          assignee: assignee ?? null,
          followers: normalizeTaskEmails(options.followers),
          priority,
          status,
          tags: normalizeTaskTags(options.tags),
          fields: normalizeTaskFieldValues(options.fields),
          parentId: options.parentId || null,
          blockedBy: normalizeTaskIds(options.blockedBy),
          startDate,
          dueDate,
          targetLaunchDate,
          source,
          // An imported task keeps its original creation time, but
          // `createdBy` still records the account that ran the import so
          // the audit trail stays truthful.
          createdAt: createdAt ?? serverTimestamp(),
          createdBy: window.firebase.user.email || '',
          importedAuthor: imported?.author || null,
          updatedAt: serverTimestamp(),
          updatedBy: window.firebase.user.email || '',
        });
        return String(nextTaskId);
      }
      nextTaskId += 1;
    }

    throw new Error('unable to allocate a task id');
  });

  logAction('tasks.create', {metadata: {taskId}});
  return taskId;
}

function normalizeTaskDate(value?: Date | Timestamp | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : Timestamp.fromDate(value);
  }
  return value ?? null;
}

/** Dedupes and lower-cases a list of emails, dropping blanks. */
function normalizeTaskEmails(value?: string[] | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const emails = value
    .map((email) =>
      String(email || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  return Array.from(new Set(emails));
}

/** Dedupes and trims tags, preserving the caller's order. */
function normalizeTaskTags(value?: string[] | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const tags = value.map((tag) => String(tag || '').trim()).filter(Boolean);
  return Array.from(new Set(tags));
}

/** Dedupes task ids, dropping blanks. */
function normalizeTaskIds(value?: string[] | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = value.map((id) => String(id || '').trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

function normalizeTaskSource(value?: TaskSource | null): TaskSource | null {
  const provider = String(value?.provider || '').trim();
  if (!provider) {
    return null;
  }
  const source: TaskSource = {provider};
  if (value?.url) {
    source.url = String(value.url);
  }
  if (value?.id) {
    source.id = String(value.id);
  }
  return source;
}

/**
 * Drops `undefined` values, which Firestore rejects, and normalizes each
 * value to a type the field renderers understand.
 */
function normalizeTaskFieldValues(
  value?: Record<string, TaskFieldValue | Date> | null
): Record<string, TaskFieldValue> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const fields: Record<string, TaskFieldValue> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) {
      continue;
    }
    fields[key] = normalizeTaskFieldValue(fieldValue);
  }
  return fields;
}

function normalizeTaskFieldValue(value: TaskFieldValue | Date): TaskFieldValue {
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  if (Array.isArray(value)) {
    return normalizeTaskTags(value);
  }
  if (value === undefined) {
    return null;
  }
  return value;
}

/**
 * Returns the task's due date, falling back to the legacy
 * `targetLaunchDate` for tasks written before `dueDate` existed.
 */
export function getTaskDueDate(task: Task): Timestamp | null {
  return task.dueDate ?? task.targetLaunchDate ?? null;
}

/** True when an open task's due date is in the past. */
export function isTaskOverdue(task: Task, now: number = Date.now()): boolean {
  if (!isOpenTaskStatus(task.status)) {
    return false;
  }
  const dueDate = getTaskDueDate(task);
  return Boolean(dueDate?.toMillis && dueDate.toMillis() < now);
}

/** Returns the direct subtasks of `parentId`, oldest first. */
export function getSubtasks(tasks: Task[], parentId: string): Task[] {
  return tasks
    .filter((task) => task.parentId === parentId)
    .sort(
      (a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
    );
}

/** Counts completed vs. total subtasks, for the parent's list rollup. */
export function getSubtaskProgress(tasks: Task[], parentId: string) {
  const subtasks = getSubtasks(tasks, parentId);
  const completed = subtasks.filter(
    (task) => !isOpenTaskStatus(task.status)
  ).length;
  return {completed, total: subtasks.length};
}

/**
 * Returns the still-open tasks blocking `task`. Resolved blockers are
 * ignored so a task stops reading as blocked once its blockers close.
 */
export function getBlockingTasks(task: Task, tasks: Task[]): Task[] {
  const blockedBy = task.blockedBy || [];
  if (blockedBy.length === 0) {
    return [];
  }
  const tasksById = new Map(tasks.map((item) => [item.id, item]));
  return blockedBy
    .map((id) => tasksById.get(id))
    .filter((blocker): blocker is Task => {
      return Boolean(blocker && isOpenTaskStatus(blocker.status));
    });
}

export function isTaskBlocked(task: Task, tasks: Task[]): boolean {
  return getBlockingTasks(task, tasks).length > 0;
}

/**
 * Client-side search across id, title, description, tags, assignee, and
 * custom field values. Every whitespace-separated term must match, so
 * typing more words narrows the result set.
 */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return tasks;
  }
  return tasks.filter((task) => {
    const haystack = getTaskSearchText(task);
    return terms.every((term) => haystack.includes(term));
  });
}

function getTaskSearchText(task: Task): string {
  const parts: string[] = [
    `#${task.id}`,
    task.title || '',
    task.description || '',
    task.assignee || '',
    task.status || '',
    task.priority || '',
    ...(task.tags || []),
    ...(task.followers || []),
  ];
  for (const value of Object.values(task.fields || {})) {
    if (Array.isArray(value)) {
      parts.push(value.join(' '));
    } else if (value !== null && !(value instanceof Timestamp)) {
      parts.push(String(value));
    }
  }
  return parts.join(' ').toLowerCase();
}

export type TaskSortKey =
  | 'created'
  | 'updated'
  | 'title'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'dueDate';

export type TaskSortDirection = 'asc' | 'desc';

const TASK_PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  normal: 2,
};

const TASK_STATUS_RANK: Record<string, number> = {
  new: 0,
  'in-progress': 1,
  'in-review': 2,
  closed: 3,
};

/**
 * Sorts a copy of `tasks`. Tasks with no value for the sort key always
 * sort last regardless of direction, so "no due date" never displaces
 * dated work at the top of the list.
 */
export function sortTasks(
  tasks: Task[],
  key: TaskSortKey,
  direction: TaskSortDirection = 'desc'
): Task[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const aMissing = isTaskSortValueMissing(a, key);
    const bMissing = isTaskSortValueMissing(b, key);
    if (aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }
    return sign * compareTaskSortValues(a, b, key);
  });
}

function isTaskSortValueMissing(task: Task, key: TaskSortKey): boolean {
  switch (key) {
    case 'dueDate':
      return !getTaskDueDate(task);
    case 'assignee':
      return !task.assignee;
    case 'updated':
      return !task.updatedAt;
    default:
      return false;
  }
}

function compareTaskSortValues(a: Task, b: Task, key: TaskSortKey): number {
  switch (key) {
    case 'title':
      return (a.title || '').localeCompare(b.title || '');
    case 'assignee':
      return (a.assignee || '').localeCompare(b.assignee || '');
    case 'status':
      return getTaskStatusRank(a) - getTaskStatusRank(b);
    case 'priority':
      return getTaskPriorityRank(a) - getTaskPriorityRank(b);
    case 'dueDate':
      return (
        timestampMillis(getTaskDueDate(a)) - timestampMillis(getTaskDueDate(b))
      );
    case 'updated':
      return timestampMillis(a.updatedAt) - timestampMillis(b.updatedAt);
    case 'created':
    default:
      return timestampMillis(a.createdAt) - timestampMillis(b.createdAt);
  }
}

function getTaskPriorityRank(task: Task): number {
  return TASK_PRIORITY_RANK[task.priority || 'normal'] ?? 2;
}

function getTaskStatusRank(task: Task): number {
  const status = normalizeTaskStatus(task.status);
  return TASK_STATUS_RANK[status] ?? TASK_STATUS_RANK.closed;
}

function timestampMillis(ts?: Timestamp | null): number {
  return ts?.toMillis?.() || 0;
}

export function isOpenTaskStatus(status?: string) {
  const normalized = normalizeTaskStatus(status);
  return !['closed', 'complete', 'completed', 'done', 'resolved'].includes(
    normalized
  );
}

export function normalizeTaskStatus(status?: string) {
  const normalized = (status || 'new').trim().toLowerCase();
  if (normalized === 'open') {
    return 'new';
  }
  if (normalized === 'blocked') {
    return 'in-progress';
  }
  if (['done', 'complete', 'completed', 'resolved'].includes(normalized)) {
    return 'closed';
  }
  return normalized;
}

function sortTasksByCreatedAt(tasks: Task[]) {
  return tasks.sort((a, b) => {
    const aMillis = a.createdAt?.toMillis?.() || 0;
    const bMillis = b.createdAt?.toMillis?.() || 0;
    return bMillis - aMillis;
  });
}

function readTasksFromSnapshot(snapshot: {
  docs: Array<{id: string; data(): unknown}>;
}) {
  return sortTasksByCreatedAt(
    snapshot.docs.map((docSnapshot) => {
      return {
        ...(docSnapshot.data() as Record<string, unknown>),
        id: docSnapshot.id,
      } as Task;
    })
  );
}

export function subscribeTasks(
  onTasks: (tasks: Task[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    tasksCollectionRef(),
    (snapshot) => {
      onTasks(readTasksFromSnapshot(snapshot));
    },
    onError
  );
}

export function subscribeOpenTasks(
  onTasks: (tasks: Task[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    tasksCollectionRef(),
    (snapshot) => {
      onTasks(
        readTasksFromSnapshot(snapshot).filter((task) =>
          isOpenTaskStatus(task.status)
        )
      );
    },
    onError
  );
}

export function subscribeTask(
  taskId: string,
  onTask: (task: Task | null) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    taskDocRef(taskId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onTask(null);
        return;
      }
      onTask({
        ...snapshot.data(),
        id: snapshot.id,
      } as Task);
    },
    onError
  );
}

export function subscribeTaskComments(
  taskId: string,
  onComments: (comments: TaskComment[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    query(taskCommentsCollectionRef(taskId), orderBy('createdAt', 'asc')),
    (snapshot) => {
      onComments(
        snapshot.docs.map((docSnapshot) => ({
          ...docSnapshot.data(),
          id: docSnapshot.id,
        })) as TaskComment[]
      );
    },
    onError
  );
}

export function subscribeTaskEvents(
  taskId: string,
  onEvents: (events: TaskEvent[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    query(taskEventsCollectionRef(taskId), orderBy('createdAt', 'asc')),
    (snapshot) => {
      onEvents(
        snapshot.docs.map((docSnapshot) => ({
          ...docSnapshot.data(),
          id: docSnapshot.id,
        })) as TaskEvent[]
      );
    },
    onError
  );
}

export async function updateTaskAssignee(
  taskId: string,
  assignee: string | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedAssignee = assignee?.trim() || null;
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'assignee',
    normalizedAssignee
  );
  if (didUpdate) {
    logAction('tasks.updateAssignee', {
      metadata: {taskId, assignee: normalizedAssignee},
    });
  }
}

export async function updateTaskTitle(taskId: string, title: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error('missing title');
  }
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'title',
    normalizedTitle
  );
  if (didUpdate) {
    logAction('tasks.updateTitle', {metadata: {taskId}});
  }
}

export async function updateTaskStatus(taskId: string, status: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!status) {
    throw new Error('missing status');
  }
  const normalizedStatus = status.trim();
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'status',
    normalizedStatus
  );
  if (didUpdate) {
    logAction('tasks.updateStatus', {metadata: {taskId, status}});
  }
}

export async function updateTaskPriority(
  taskId: string,
  priority: TaskPriority
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const didUpdate = await updateTaskMetadataField(taskId, 'priority', priority);
  if (didUpdate) {
    logAction('tasks.updatePriority', {metadata: {taskId, priority}});
  }
}

/**
 * Sets the task's due date. `targetLaunchDate` is mirrored in the same
 * transaction so callers still reading the legacy field stay correct.
 */
export async function updateTaskDueDate(
  taskId: string,
  dueDate?: Date | Timestamp | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedDueDate = normalizeTaskDate(dueDate);
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'dueDate',
    normalizedDueDate,
    {targetLaunchDate: normalizedDueDate}
  );
  if (didUpdate) {
    logAction('tasks.updateDueDate', {metadata: {taskId}});
  }
}

/** @deprecated Use {@link updateTaskDueDate}. */
export async function updateTaskTargetLaunchDate(
  taskId: string,
  targetLaunchDate?: Date | Timestamp | null
) {
  await updateTaskDueDate(taskId, targetLaunchDate);
}

export async function updateTaskStartDate(
  taskId: string,
  startDate?: Date | Timestamp | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'startDate',
    normalizeTaskDate(startDate)
  );
  if (didUpdate) {
    logAction('tasks.updateStartDate', {metadata: {taskId}});
  }
}

export async function updateTaskTags(taskId: string, tags: string[]) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedTags = normalizeTaskTags(tags);
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'tags',
    normalizedTags
  );
  if (didUpdate) {
    logAction('tasks.updateTags', {metadata: {taskId, tags: normalizedTags}});
  }
}

export async function updateTaskFollowers(taskId: string, followers: string[]) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedFollowers = normalizeTaskEmails(followers);
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'followers',
    normalizedFollowers
  );
  if (didUpdate) {
    logAction('tasks.updateFollowers', {
      metadata: {taskId, followers: normalizedFollowers},
    });
  }
}

/**
 * Sets the tasks that block this one. Self-references are dropped; cycles
 * are rejected so the "blocked" rollup in the list can't loop forever.
 */
export async function updateTaskBlockedBy(taskId: string, blockedBy: string[]) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedBlockedBy = normalizeTaskIds(blockedBy).filter(
    (id) => id !== taskId
  );
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'blockedBy',
    normalizedBlockedBy
  );
  if (didUpdate) {
    logAction('tasks.updateBlockedBy', {
      metadata: {taskId, blockedBy: normalizedBlockedBy},
    });
  }
}

/** Makes `taskId` a subtask of `parentId`, or a top-level task when null. */
export async function updateTaskParent(
  taskId: string,
  parentId: string | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedParentId = parentId?.trim() || null;
  if (normalizedParentId === taskId) {
    throw new Error('a task cannot be its own parent');
  }
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'parentId',
    normalizedParentId
  );
  if (didUpdate) {
    logAction('tasks.updateParent', {
      metadata: {taskId, parentId: normalizedParentId},
    });
  }
}

/** Sets one custom field value, tracked in the timeline as `field:<id>`. */
export async function updateTaskFieldValue(
  taskId: string,
  fieldId: string,
  value: TaskFieldValue | Date
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!fieldId) {
    throw new Error('missing field id');
  }
  const didUpdate = await updateTaskMetadataField(
    taskId,
    taskCustomFieldKey(fieldId),
    normalizeTaskFieldValue(value)
  );
  if (didUpdate) {
    logAction('tasks.updateFieldValue', {metadata: {taskId, fieldId}});
  }
}

/**
 * Updates the task description. Accepts either plain text or rich text; a
 * plain-text projection is always written to `description` so list search
 * and previews keep working regardless of which form was used.
 */
export async function updateTaskDescription(
  taskId: string,
  description: string | RichTextData
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const body = typeof description === 'string' ? null : description;
  const text =
    typeof description === 'string'
      ? description
      : getRichTextPlainText(description);
  await updateDoc(taskDocRef(taskId), {
    description: text,
    descriptionBody: body,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });
  logAction('tasks.updateDescription', {metadata: {taskId}});
}

export async function addTaskAttachment(
  taskId: string,
  file: UploadedFile & {contentType?: string; size?: number}
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!file?.src) {
    throw new Error('missing attachment file');
  }

  const db = window.firebase.db;
  const taskRef = taskDocRef(taskId);
  const userEmail = window.firebase.user.email || '';
  const attachment: TaskAttachment = {
    ...file,
    id: doc(taskEventsCollectionRef(taskId)).id,
    attachedAt: Timestamp.now(),
    attachedBy: userEmail,
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) {
      throw new Error('task not found');
    }
    const data = snapshot.data() as Task;
    const attachments = normalizeTaskAttachments(data.attachments);

    transaction.update(taskRef, {
      attachments: [...attachments, attachment],
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
  });

  logAction('tasks.attachment.add', {
    metadata: {
      taskId,
      attachmentId: attachment.id,
      filename: attachment.filename || attachment.src,
    },
  });

  return attachment;
}

export async function removeTaskAttachment(
  taskId: string,
  attachmentId: string
) {
  if (!taskId || !attachmentId) {
    throw new Error('missing task or attachment id');
  }

  const db = window.firebase.db;
  const taskRef = taskDocRef(taskId);
  const userEmail = window.firebase.user.email || '';
  let removedAttachment: TaskAttachment | undefined;

  const didUpdate = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) {
      throw new Error('task not found');
    }
    const data = snapshot.data() as Task;
    const attachments = normalizeTaskAttachments(data.attachments);
    removedAttachment = attachments.find(
      (attachment) => attachment.id === attachmentId
    );
    if (!removedAttachment) {
      return false;
    }

    transaction.update(taskRef, {
      attachments: attachments.filter(
        (attachment) => attachment.id !== attachmentId
      ),
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    return true;
  });

  if (didUpdate) {
    logAction('tasks.attachment.remove', {
      metadata: {
        taskId,
        attachmentId,
        filename: removedAttachment?.filename || removedAttachment?.src || '',
      },
    });
  }
}

/**
 * Writes one tracked field and records a timeline event describing the
 * change. `extraUpdates` lets a caller keep a derived field in sync (e.g.
 * the legacy `targetLaunchDate` mirror) inside the same transaction.
 * Returns false when the value is unchanged, so no event is written.
 */
async function updateTaskMetadataField(
  taskId: string,
  field: TaskMetadataField,
  value: TaskEventValue | Date,
  extraUpdates?: Record<string, unknown>
) {
  const db = window.firebase.db;
  const taskRef = taskDocRef(taskId);
  const eventRef = taskEventDocRef(taskId);
  const userEmail = window.firebase.user.email || '';

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) {
      throw new Error('task not found');
    }

    const data = snapshot.data() as Task;
    const oldValue = normalizeTaskMetadataValue(
      readTaskMetadataField(data, field)
    );
    const newValue = normalizeTaskMetadataValue(value);
    if (taskMetadataValuesEqual(oldValue, newValue)) {
      return false;
    }

    const customFieldId = parseTaskCustomFieldKey(field);
    const fieldUpdate = customFieldId
      ? {[`fields.${customFieldId}`]: newValue}
      : {[field]: newValue};

    transaction.update(taskRef, {
      ...fieldUpdate,
      ...(extraUpdates || {}),
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    transaction.set(eventRef, {
      id: eventRef.id,
      taskId,
      type: 'metadata',
      field,
      oldValue,
      newValue,
      createdAt: serverTimestamp(),
      createdBy: userEmail,
    });
    return true;
  });
}

/** Reads either a top-level task field or a `field:<id>` custom field. */
function readTaskMetadataField(data: Task, field: TaskMetadataField): unknown {
  const customFieldId = parseTaskCustomFieldKey(field);
  if (customFieldId) {
    return data.fields?.[customFieldId];
  }
  return (data as Record<string, unknown>)[field];
}

function normalizeTaskMetadataValue(value: unknown): TaskEventValue {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : Timestamp.fromDate(value);
  }
  if (
    value instanceof Timestamp ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return null;
}

function taskMetadataValuesEqual(a: TaskEventValue, b: TaskEventValue) {
  if (a instanceof Timestamp && b instanceof Timestamp) {
    return a.toMillis() === b.toMillis();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  return a === b;
}

function normalizeTaskAttachments(value: unknown): TaskAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((attachment): attachment is TaskAttachment => {
    return Boolean(attachment?.id && attachment?.src);
  });
}

export async function addTaskComment(
  taskId: string,
  content: string | RichTextData,
  parentId?: string | null,
  options?: {
    mentions?: string[];
    attachments?: TaskAttachment[];
    imported?: TaskImportOptions;
  }
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!content) {
    throw new Error('missing comment content');
  }
  const body = normalizeTaskCommentBody(content);
  const contentText =
    typeof content === 'string' ? content : getRichTextPlainText(content);
  const attachments = normalizeTaskAttachments(options?.attachments);
  if (!contentText.trim() && !body && attachments.length === 0) {
    throw new Error('missing comment content');
  }

  const commentRef = doc(taskCommentsCollectionRef(taskId));
  const commentId = commentRef.id;
  const mentions = (options?.mentions || []).map((m) => m.toLowerCase());
  const imported = options?.imported;
  const importedCreatedAt = imported?.createdAt
    ? normalizeTaskDate(imported.createdAt)
    : null;

  await setDoc(commentRef, {
    id: commentId,
    taskId,
    parentId: parentId || null,
    content: contentText,
    body,
    attachments,
    mentions,
    // Imported comments keep the original post time and show the original
    // author's name, but `createdBy` still records the importing account.
    createdAt: importedCreatedAt ?? serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    importedAuthor: imported?.author || null,
    source: normalizeTaskSource(imported?.source),
    history: [],
  });

  logAction('tasks.comment.add', {
    metadata: {taskId, commentId, parentId: parentId || null, mentions},
  });

  return commentId;
}

/** Attaches an uploaded file to a comment. */
export async function addTaskCommentAttachment(
  taskId: string,
  commentId: string,
  file: UploadedFile & {contentType?: string; size?: number}
) {
  if (!taskId || !commentId) {
    throw new Error('missing task or comment id');
  }
  if (!file?.src) {
    throw new Error('missing attachment file');
  }

  const db = window.firebase.db;
  const commentRef = taskCommentDocRef(taskId, commentId);
  const userEmail = window.firebase.user.email || '';
  const attachment: TaskAttachment = {
    ...file,
    id: doc(taskCommentsCollectionRef(taskId)).id,
    attachedAt: Timestamp.now(),
    attachedBy: userEmail,
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(commentRef);
    if (!snapshot.exists()) {
      throw new Error('comment not found');
    }
    const data = snapshot.data() as TaskComment;
    transaction.update(commentRef, {
      attachments: [...normalizeTaskAttachments(data.attachments), attachment],
    });
  });

  logAction('tasks.comment.attachment.add', {
    metadata: {
      taskId,
      commentId,
      attachmentId: attachment.id,
      filename: attachment.filename || attachment.src,
    },
  });

  return attachment;
}

/** Removes an attachment from a comment. */
export async function removeTaskCommentAttachment(
  taskId: string,
  commentId: string,
  attachmentId: string
) {
  if (!taskId || !commentId || !attachmentId) {
    throw new Error('missing task, comment, or attachment id');
  }

  const db = window.firebase.db;
  const commentRef = taskCommentDocRef(taskId, commentId);

  const didUpdate = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(commentRef);
    if (!snapshot.exists()) {
      throw new Error('comment not found');
    }
    const data = snapshot.data() as TaskComment;
    const attachments = normalizeTaskAttachments(data.attachments);
    if (!attachments.some((attachment) => attachment.id === attachmentId)) {
      return false;
    }
    transaction.update(commentRef, {
      attachments: attachments.filter(
        (attachment) => attachment.id !== attachmentId
      ),
    });
    return true;
  });

  if (didUpdate) {
    logAction('tasks.comment.attachment.remove', {
      metadata: {taskId, commentId, attachmentId},
    });
  }
}

export async function editTaskComment(
  taskId: string,
  commentId: string,
  content: string | RichTextData,
  options?: {mentions?: string[]}
) {
  if (!taskId || !commentId) {
    throw new Error('missing task or comment id');
  }
  if (!content) {
    throw new Error('missing comment content');
  }
  const body = normalizeTaskCommentBody(content);
  const contentText =
    typeof content === 'string' ? content : getRichTextPlainText(content);
  if (!contentText.trim() && !body) {
    throw new Error('missing comment content');
  }

  const commentRef = taskCommentDocRef(taskId, commentId);
  const snapshot = await getDoc(commentRef);
  if (!snapshot.exists()) {
    throw new Error('comment not found');
  }
  const data = snapshot.data() as TaskComment;
  const mentions = (options?.mentions || []).map((m) => m.toLowerCase());

  await updateDoc(commentRef, {
    content: contentText,
    body,
    mentions,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
    isDeleted: false,
    history: arrayUnion({
      action: 'edit',
      content: data.content,
      body: data.body || null,
      changedAt: Timestamp.now(),
      changedBy: window.firebase.user.email || '',
    }),
  });

  logAction('tasks.comment.edit', {
    metadata: {taskId, commentId, mentions},
  });
}

function normalizeTaskCommentBody(content: string | RichTextData) {
  return typeof content === 'string' ? null : content;
}

function getRichTextPlainText(data: RichTextData | null) {
  if (!data?.blocks?.length) {
    return '';
  }
  return data.blocks
    .map((block) => getRichTextBlockPlainText(block))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getRichTextBlockPlainText(block: RichTextBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return stripHtml(block.data?.text || '');
    case 'orderedList':
    case 'unorderedList':
      return (block.data?.items || [])
        .map((item: any) => getRichTextListItemPlainText(item))
        .filter(Boolean)
        .join('\n');
    case 'image':
      return block.data?.file?.alt || block.data?.file?.url || '';
    default:
      return '';
  }
}

function getRichTextListItemPlainText(item: {
  content?: string;
  items?: Array<any>;
}) {
  const parts = [stripHtml(item.content || '')];
  if (item.items?.length) {
    parts.push(
      item.items
        .map((child) => getRichTextListItemPlainText(child))
        .filter(Boolean)
        .join('\n')
    );
  }
  return parts.filter(Boolean).join('\n');
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, '');
}

export async function deleteTaskComment(taskId: string, commentId: string) {
  if (!taskId || !commentId) {
    throw new Error('missing task or comment id');
  }

  const commentRef = taskCommentDocRef(taskId, commentId);
  const snapshot = await getDoc(commentRef);
  if (!snapshot.exists()) {
    throw new Error('comment not found');
  }
  const data = snapshot.data() as TaskComment;

  await updateDoc(commentRef, {
    content: '',
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: window.firebase.user.email || '',
    history: arrayUnion({
      action: 'delete',
      content: data.content,
      changedAt: Timestamp.now(),
      changedBy: window.firebase.user.email || '',
    }),
  });

  logAction('tasks.comment.delete', {
    metadata: {taskId, commentId},
  });
}
