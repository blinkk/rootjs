import {
  FieldPath,
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {logAction} from './actions.js';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignee?: string | null;
  status?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface TaskCommentHistoryEntry {
  action: 'edit' | 'delete';
  content: string;
  changedAt: Timestamp;
  changedBy: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
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

function taskCommentDocRef(taskId: string, commentId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(db, 'Projects', projectId, 'Tasks', taskId, 'Comments', commentId);
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
  await updateDoc(projectDocRef(), new FieldPath('settings', 'defaultAssignee'), assignee);
  logAction('tasks.defaultAssignee', {
    metadata: {assignee: assignee || null},
  });
}

export async function createTask(options: {
  title: string;
  description?: string;
  assignee?: string | null;
}) {
  if (!options.title) {
    throw new Error('missing task title');
  }

  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const taskRef = doc(collection(db, 'Projects', projectId, 'Tasks'));
  const assignee = options.assignee ?? (await getDefaultTaskAssignee());
  const status = 'open';

  await setDoc(taskRef, {
    id: taskRef.id,
    title: options.title,
    description: options.description || '',
    assignee: assignee ?? null,
    status,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });

  logAction('tasks.create', {metadata: {taskId: taskRef.id}});
}

export async function updateTaskAssignee(taskId: string, assignee: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  await updateDoc(taskDocRef(taskId), {
    assignee,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });
  logAction('tasks.updateAssignee', {metadata: {taskId, assignee}});
}

export async function updateTaskStatus(taskId: string, status: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!status) {
    throw new Error('missing status');
  }
  await updateDoc(taskDocRef(taskId), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: window.firebase.user.email || '',
  });
  logAction('tasks.updateStatus', {metadata: {taskId, status}});
}

export async function addTaskComment(taskId: string, content: string) {
  if (!taskId) {
    throw new Error('missing task id');
  }
  if (!content) {
    throw new Error('missing comment content');
  }

  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const commentRef = doc(
    collection(db, 'Projects', projectId, 'Tasks', taskId, 'Comments')
  );
  const commentId = commentRef.id;

  await setDoc(commentRef, {
    id: commentId,
    taskId,
    content,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || '',
    history: [],
  });

  logAction('tasks.comment.add', {
    metadata: {taskId, commentId},
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
