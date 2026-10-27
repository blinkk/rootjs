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
import {getRichTextPlainText, RichTextData} from '../../shared/richtext.js';
import {logAction} from './actions.js';
import type {UploadedFile} from './gcs.js';

const TASK_COUNTER_ID = 'tasks';
const TASK_ID_ALLOCATION_ATTEMPTS = 20;

export interface Task {
  id: string;
  title: string;
  description?: string;
  attachments?: TaskAttachment[];
  assignee?: string | null;
  /** Emails of users cc'd on the task. */
  cc?: string[];
  priority?: TaskPriority;
  status?: string;
  /**
   * How the target launch is specified. Tasks saved before this field existed
   * only have `targetLaunchDate`, which reads as `date`. Use
   * `getTaskTargetLaunch()` rather than reading these fields directly.
   */
  targetLaunchType?: TaskTargetLaunchType | null;
  /** Local midnight for `date`, the exact time for `datetime`, else null. */
  targetLaunchDate?: Timestamp | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
}

export type TaskPriority = 'high' | 'medium' | 'normal';

/**
 * How a task's target launch is specified: `anytime` (no deadline), `asap`
 * (urgent), `date` (any time on a given day), or `datetime` (an exact time).
 */
export type TaskTargetLaunchType = 'anytime' | 'asap' | 'date' | 'datetime';

/** A task's target launch, as read from the DB. */
export interface TaskTargetLaunch {
  type: TaskTargetLaunchType;
  /** Set for `date` and `datetime`, null otherwise. */
  date: Timestamp | null;
}

/** A target launch to save. `date` is required for `date` and `datetime`. */
export interface TaskTargetLaunchInput {
  type: TaskTargetLaunchType;
  date: Date | null;
}
export type TaskUnsubscribe = () => void;

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
  /** Files attached to the comment (e.g. pasted images). */
  attachments?: TaskAttachment[];
  /** Lower-cased emails of users mentioned via `@<email>` in the content. */
  mentions?: string[];
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
  deletedAt?: Timestamp;
  deletedBy?: string;
  isDeleted?: boolean;
  history?: TaskCommentHistoryEntry[];
}

export type TaskMetadataField =
  'title' | 'assignee' | 'cc' | 'priority' | 'status' | 'targetLaunchDate';

export interface TaskEvent {
  id: string;
  taskId: string;
  type: 'metadata';
  field: TaskMetadataField;
  oldValue: string | Timestamp | null;
  newValue: string | Timestamp | null;
  /** For `targetLaunchDate` events, the launch types before and after. */
  oldTargetLaunchType?: TaskTargetLaunchType | null;
  newTargetLaunchType?: TaskTargetLaunchType | null;
  createdAt: Timestamp;
  createdBy: string;
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

export async function createTask(options: {
  title: string;
  description?: string;
  assignee?: string | null;
  priority?: TaskPriority;
  targetLaunch?: TaskTargetLaunchInput | null;
}) {
  if (!options.title) {
    throw new Error('missing task title');
  }

  const db = window.firebase.db;
  const assignee = options.assignee ?? (await getDefaultTaskAssignee());
  const priority = options.priority || 'normal';
  const status = 'new';
  const targetLaunch = normalizeTaskTargetLaunchInput(options.targetLaunch);
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
          assignee: assignee ?? null,
          priority,
          status,
          targetLaunchType: targetLaunch.type,
          targetLaunchDate: targetLaunch.date,
          createdAt: serverTimestamp(),
          createdBy: window.firebase.user.email || '',
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

/** Converts a target launch to the values stored on the task doc. */
function normalizeTaskTargetLaunchInput(input?: TaskTargetLaunchInput | null): {
  type: TaskTargetLaunchType | null;
  date: Timestamp | null;
} {
  if (!input) {
    return {type: null, date: null};
  }
  if (input.type === 'anytime' || input.type === 'asap') {
    return {type: input.type, date: null};
  }
  if (!input.date) {
    throw new Error(`target launch type "${input.type}" requires a date`);
  }
  return {type: input.type, date: Timestamp.fromDate(input.date)};
}

/**
 * Builds a target launch from its stored type and date, or returns null if
 * none is set. A date with no type (saved before types existed) is a `date`.
 */
export function toTaskTargetLaunch(
  type?: TaskTargetLaunchType | null,
  date?: Timestamp | null
): TaskTargetLaunch | null {
  if (type === 'anytime' || type === 'asap') {
    return {type, date: null};
  }
  if (!date?.toMillis) {
    return null;
  }
  return {type: type === 'datetime' ? 'datetime' : 'date', date};
}

/** Returns the task's target launch, or null if none is set. */
export function getTaskTargetLaunch(
  task: Pick<Task, 'targetLaunchType' | 'targetLaunchDate'>
) {
  return toTaskTargetLaunch(task.targetLaunchType, task.targetLaunchDate);
}

/**
 * Returns true once a target launch has passed: the end of the day for
 * `date`, the exact time for `datetime`. `anytime` and `asap` never are.
 */
export function isTaskTargetLaunchPast(
  launch: TaskTargetLaunch | null,
  now = Date.now()
) {
  if (!launch?.date) {
    return false;
  }
  if (launch.type === 'datetime') {
    return launch.date.toMillis() < now;
  }
  const nextDay = new Date(launch.date.toMillis());
  nextDay.setHours(0, 0, 0, 0);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.getTime() <= now;
}

/**
 * Formats a target launch for display, e.g. "ASAP", "Nov 14, 2026", or
 * "Nov 14, 2026, 9:00 AM". With `short`, the year is dropped and today's date
 * reads as "Today".
 */
export function formatTaskTargetLaunch(
  launch: TaskTargetLaunch | null,
  options?: {short?: boolean}
) {
  if (!launch) {
    return 'No date';
  }
  if (launch.type === 'anytime') {
    return 'Anytime';
  }
  if (launch.type === 'asap') {
    return 'ASAP';
  }
  const date = new Date(launch.date!.toMillis());
  const time =
    launch.type === 'datetime'
      ? date.toLocaleTimeString('en', {hour: 'numeric', minute: '2-digit'})
      : '';
  if (options?.short) {
    const day =
      date.toDateString() === new Date().toDateString()
        ? 'Today'
        : date.toLocaleDateString('en', {month: 'short', day: 'numeric'});
    return time ? `${day}, ${time}` : day;
  }
  const day = date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return time ? `${day}, ${time}` : day;
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
    snapshot.docs
      .map((docSnapshot) => {
        return {
          ...(docSnapshot.data() as Record<string, unknown>),
          id: docSnapshot.id,
        } as Task;
      })
      .filter((task) => !task.deleted)
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

/**
 * Updates the cc list on a task. The task doc stores the list as an array;
 * the history event records the values as comma-joined strings.
 */
export async function updateTaskCcList(taskId: string, cc: string[]) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedCc = normalizeTaskCcList(cc);
  const db = window.firebase.db;
  const taskRef = taskDocRef(taskId);
  const eventRef = taskEventDocRef(taskId);
  const userEmail = window.firebase.user.email || '';

  const didUpdate = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) {
      throw new Error('task not found');
    }
    const data = snapshot.data() as Task;
    const oldCc = normalizeTaskCcList(data.cc || []);
    if (oldCc.join(',') === normalizedCc.join(',')) {
      return false;
    }
    transaction.update(taskRef, {
      cc: normalizedCc,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    transaction.set(eventRef, {
      id: eventRef.id,
      taskId,
      type: 'metadata',
      field: 'cc',
      oldValue: oldCc.join(', ') || null,
      newValue: normalizedCc.join(', ') || null,
      createdAt: serverTimestamp(),
      createdBy: userEmail,
    });
    return true;
  });

  if (didUpdate) {
    logAction('tasks.updateCc', {metadata: {taskId, cc: normalizedCc}});
  }
}

/** Trims, lower-cases, and de-dupes a list of cc emails. */
export function normalizeTaskCcList(cc: string[]) {
  const normalized: string[] = [];
  cc.forEach((email) => {
    const value = email.trim().toLowerCase();
    if (value && !normalized.includes(value)) {
      normalized.push(value);
    }
  });
  return normalized;
}

/** Soft-deletes a task so it no longer appears in task lists. */
export async function deleteTask(taskId: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  await updateDoc(taskDocRef(taskId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: window.firebase.user.email || '',
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });
  logAction('tasks.delete', {metadata: {taskId}});
}

/** Restores a soft-deleted task. */
export async function restoreTask(taskId: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  await updateDoc(taskDocRef(taskId), {
    deleted: false,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });
  logAction('tasks.restore', {metadata: {taskId}});
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
 * Sets (or clears, with null) a task's target launch. The type and date are
 * saved together with a single history event.
 */
export async function updateTaskTargetLaunch(
  taskId: string,
  targetLaunch: TaskTargetLaunchInput | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const next = normalizeTaskTargetLaunchInput(targetLaunch);
  const db = window.firebase.db;
  const taskRef = taskDocRef(taskId);
  const eventRef = taskEventDocRef(taskId);
  const userEmail = window.firebase.user.email || '';

  const didUpdate = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) {
      throw new Error('task not found');
    }
    const prev = getTaskTargetLaunch(snapshot.data() as Task);
    const prevType = prev?.type ?? null;
    const prevDate = prev?.date ?? null;
    if (
      prevType === next.type &&
      taskMetadataValuesEqual(prevDate, next.date)
    ) {
      return false;
    }

    transaction.update(taskRef, {
      targetLaunchType: next.type,
      targetLaunchDate: next.date,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    transaction.set(eventRef, {
      id: eventRef.id,
      taskId,
      type: 'metadata',
      field: 'targetLaunchDate',
      oldValue: prevDate,
      newValue: next.date,
      oldTargetLaunchType: prevType,
      newTargetLaunchType: next.type,
      createdAt: serverTimestamp(),
      createdBy: userEmail,
    });
    return true;
  });
  if (didUpdate) {
    logAction('tasks.updateTargetLaunch', {
      metadata: {taskId, type: next.type},
    });
  }
}

export async function updateTaskDescription(
  taskId: string,
  description: string
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  await updateDoc(taskDocRef(taskId), {
    description,
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

async function updateTaskMetadataField(
  taskId: string,
  field: TaskMetadataField,
  value: string | Timestamp | null
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
    const oldValue = normalizeTaskMetadataValue(data[field]);
    const newValue = normalizeTaskMetadataValue(value);
    if (taskMetadataValuesEqual(oldValue, newValue)) {
      return false;
    }

    transaction.update(taskRef, {
      [field]: newValue,
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

function normalizeTaskMetadataValue(value: unknown): string | Timestamp | null {
  if (value instanceof Timestamp || typeof value === 'string') {
    return value;
  }
  return null;
}

function taskMetadataValuesEqual(
  a: string | Timestamp | null,
  b: string | Timestamp | null
) {
  if (a instanceof Timestamp && b instanceof Timestamp) {
    return a.toMillis() === b.toMillis();
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

/** Builds a `TaskAttachment` from an uploaded file, for embedding in a comment. */
export function buildTaskAttachment(
  file: UploadedFile & {contentType?: string; size?: number}
): TaskAttachment {
  const attachment: Record<string, unknown> = {};
  // Skip undefined values, which firestore rejects.
  Object.entries(file).forEach(([key, value]) => {
    if (value !== undefined) {
      attachment[key] = value;
    }
  });
  attachment.id = doc(tasksCollectionRef()).id;
  attachment.attachedAt = Timestamp.now();
  attachment.attachedBy = window.firebase.user.email || '';
  return attachment as unknown as TaskAttachment;
}

export async function addTaskComment(
  taskId: string,
  content: string | RichTextData | null,
  parentId?: string | null,
  options?: {mentions?: string[]; attachments?: TaskAttachment[]}
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const attachments = options?.attachments || [];
  if (!content && attachments.length === 0) {
    throw new Error('missing comment content');
  }
  const body = content ? normalizeTaskCommentBody(content) : null;
  const contentText = !content
    ? ''
    : typeof content === 'string'
      ? content
      : getRichTextPlainText(content);
  if (!contentText.trim() && !body && attachments.length === 0) {
    throw new Error('missing comment content');
  }

  const commentRef = doc(taskCommentsCollectionRef(taskId));
  const commentId = commentRef.id;
  const mentions = (options?.mentions || []).map((m) => m.toLowerCase());

  await setDoc(commentRef, {
    id: commentId,
    taskId,
    parentId: parentId || null,
    content: contentText,
    body,
    attachments,
    mentions,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    history: [],
  });

  // Bump the task's `updatedAt` so comment activity is reflected in lists.
  await updateDoc(taskDocRef(taskId), {
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });

  logAction('tasks.comment.add', {
    metadata: {taskId, commentId, parentId: parentId || null, mentions},
  });

  return commentId;
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
