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
import {logAction} from './actions.js';

const TASK_COUNTER_ID = 'tasks';
const TASK_ID_ALLOCATION_ATTEMPTS = 20;

export interface Task {
  id: string;
  title: string;
  description?: string;
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

export interface TaskCommentHistoryEntry {
  action: 'edit' | 'delete';
  content: string;
  changedAt: Timestamp;
  changedBy: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  parentId?: string | null;
  content: string;
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
  const status = 'open';
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

function isOpenTaskStatus(status?: string) {
  const normalized = (status || 'open').toLowerCase();
  return !['closed', 'complete', 'completed', 'done', 'resolved'].includes(
    normalized
  );
}

export function subscribeOpenTasks(
  onTasks: (tasks: Task[]) => void,
  onError?: (err: Error) => void
): TaskUnsubscribe {
  return onSnapshot(
    tasksCollectionRef(),
    (snapshot) => {
      const tasks = snapshot.docs
        .map((docSnapshot) => {
          return {
            ...docSnapshot.data(),
            id: docSnapshot.id,
          } as Task;
        })
        .filter((task) => isOpenTaskStatus(task.status))
        .sort((a, b) => {
          const aMillis = a.createdAt?.toMillis?.() || 0;
          const bMillis = b.createdAt?.toMillis?.() || 0;
          return bMillis - aMillis;
        });
      onTasks(tasks);
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

export async function addTaskComment(
  taskId: string,
  content: string,
  parentId?: string | null
) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!content) {
    throw new Error('missing comment content');
  }

  const commentRef = doc(taskCommentsCollectionRef(taskId));
  const commentId = commentRef.id;

  await setDoc(commentRef, {
    id: commentId,
    taskId,
    parentId: parentId || null,
    content,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    history: [],
  });

  logAction('tasks.comment.add', {
    metadata: {taskId, commentId, parentId: parentId || null},
  });

  return commentId;
}

export async function editTaskComment(
  taskId: string,
  commentId: string,
  content: string
) {
  if (!taskId || !commentId) {
    throw new Error('missing task or comment id');
  }
  if (!content) {
    throw new Error('missing comment content');
  }

  const commentRef = taskCommentDocRef(taskId, commentId);
  const snapshot = await getDoc(commentRef);
  if (!snapshot.exists()) {
    throw new Error('comment not found');
  }
  const data = snapshot.data() as TaskComment;

  await updateDoc(commentRef, {
    content,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
    isDeleted: false,
    history: arrayUnion({
      action: 'edit',
      content: data.content,
      changedAt: Timestamp.now(),
      changedBy: window.firebase.user.email || '',
    }),
  });

  logAction('tasks.comment.edit', {
    metadata: {taskId, commentId},
  });
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
