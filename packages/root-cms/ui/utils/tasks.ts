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
  attachments?: TaskAttachment[];
  assignee?: string | null;
  priority?: TaskPriority;
  status?: string;
  targetLaunchDate?: Timestamp | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export type TaskPriority = 'high' | 'medium' | 'normal';
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
  | 'title'
  | 'assignee'
  | 'priority'
  | 'status'
  | 'targetLaunchDate';

export interface TaskEvent {
  id: string;
  taskId: string;
  type: 'metadata';
  field: TaskMetadataField;
  oldValue: string | Timestamp | null;
  newValue: string | Timestamp | null;
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
  targetLaunchDate?: Date | Timestamp | null;
}) {
  if (!options.title) {
    throw new Error('missing task title');
  }

  const db = window.firebase.db;
  const assignee = options.assignee ?? (await getDefaultTaskAssignee());
  const priority = options.priority || 'normal';
  const status = 'new';
  const targetLaunchDate = normalizeTaskTargetLaunchDate(
    options.targetLaunchDate
  );
  const taskId = await runTransaction(db, async (transaction) => {
    const counterRef = taskCounterDocRef();
    const counterSnapshot = await transaction.get(counterRef);
    const counterData = counterSnapshot.data() || {};
    const lastTaskId =
      typeof counterData.lastTaskId === 'number' ? counterData.lastTaskId : 0;
    let nextTaskId = Math.floor(lastTaskId) + 1;
    let taskRef = taskDocRef(String(nextTaskId));

    for (let i = 0; i < TASK_ID_ALLOCATION_ATTEMPTS; i++) {
      taskRef = taskDocRef(String(nextTaskId));
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
          targetLaunchDate,
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

function normalizeTaskTargetLaunchDate(value?: Date | Timestamp | null) {
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  return value ?? null;
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

export async function updateTaskTargetLaunchDate(
  taskId: string,
  targetLaunchDate?: Date | Timestamp | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  const normalizedTargetLaunchDate =
    normalizeTaskTargetLaunchDate(targetLaunchDate);
  const didUpdate = await updateTaskMetadataField(
    taskId,
    'targetLaunchDate',
    normalizedTargetLaunchDate
  );
  if (didUpdate) {
    logAction('tasks.updateTargetLaunchDate', {
      metadata: {taskId},
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

export async function addTaskComment(
  taskId: string,
  content: string | RichTextData,
  parentId?: string | null,
  options?: {mentions?: string[]}
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
  if (!contentText.trim() && !body) {
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
    mentions,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    history: [],
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
