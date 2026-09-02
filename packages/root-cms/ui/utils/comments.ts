import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  FIELD_COMMENT_ACTIONS,
  FieldComment,
  FieldCommentActionMetadata,
  FieldCommentThread,
  fieldKeyToThreadId,
  getThreadComments,
  normalizeEmails,
  truncateCommentContent,
} from '../../shared/comments.js';
import {
  extractRichTextMentions,
  getRichTextPlainText,
  RichTextData,
} from '../../shared/richtext.js';
import {logAction} from './actions.js';

export type FieldCommentsUnsubscribe = () => void;

/**
 * Firestore access for field comment threads, stored per draft doc at
 * `Projects/{projectId}/Collections/{collectionId}/Drafts/{slug}/Comments/{threadId}`.
 */

function parseDocId(docId: string) {
  const [collectionId, slug] = docId.split('/');
  if (!collectionId || !slug) {
    throw new Error(`invalid doc id: ${docId}`);
  }
  return {collectionId, slug};
}

function threadsCollectionRef(docId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const {collectionId, slug} = parseDocId(docId);
  return collection(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug,
    'Comments'
  );
}

function threadDocRef(docId: string, threadId: string) {
  return doc(threadsCollectionRef(docId), threadId);
}

function currentUserEmail() {
  return (window.firebase.user.email || '').toLowerCase();
}

function newEntryId(docId: string) {
  return doc(threadsCollectionRef(docId)).id;
}

function readThread(data: Record<string, any>, id: string): FieldCommentThread {
  return {
    ...(data as FieldCommentThread),
    id,
    status: data.status === 'resolved' ? 'resolved' : 'open',
    comments: Array.isArray(data.comments) ? data.comments : [],
    participants: Array.isArray(data.participants) ? data.participants : [],
  };
}

/** Subscribes to all comment threads for a doc. */
export function subscribeFieldCommentThreads(
  docId: string,
  onThreads: (threads: FieldCommentThread[]) => void,
  onError?: (err: Error) => void
): FieldCommentsUnsubscribe {
  return onSnapshot(
    threadsCollectionRef(docId),
    (snapshot) => {
      onThreads(
        snapshot.docs.map((docSnapshot) =>
          readThread(docSnapshot.data() || {}, docSnapshot.id)
        )
      );
    },
    onError
  );
}

function buildActionMetadata(
  docId: string,
  thread: Pick<FieldCommentThread, 'id' | 'fieldKey' | 'fieldLabel'>,
  extra?: Partial<FieldCommentActionMetadata>
): FieldCommentActionMetadata {
  const {collectionId, slug} = parseDocId(docId);
  const metadata: FieldCommentActionMetadata = {
    docId,
    collectionId,
    slug,
    fieldKey: thread.fieldKey,
    threadId: thread.id,
    ...extra,
  };
  if (thread.fieldLabel) {
    metadata.fieldLabel = thread.fieldLabel;
  }
  return metadata;
}

export interface AddFieldCommentOptions {
  /** Deep key of the field being commented on, e.g. `fields.hero.title`. */
  fieldKey: string;
  /** Human-readable label of the field, stored for display in lists. */
  fieldLabel?: string;
  /** Rich text body of the comment. */
  body: RichTextData;
}

/**
 * Adds a comment to a field's thread, creating the thread when the field has
 * no comments yet. Commenting on a resolved thread reopens it.
 */
export async function addFieldComment(
  docId: string,
  options: AddFieldCommentOptions
) {
  const fieldKey = (options.fieldKey || '').trim();
  if (!fieldKey) {
    throw new Error('missing field key');
  }
  const content = getRichTextPlainText(options.body);
  if (!content.trim()) {
    throw new Error('missing comment content');
  }

  const db = window.firebase.db;
  const threadId = await fieldKeyToThreadId(fieldKey);
  const threadRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();
  const mentions = extractRichTextMentions(options.body);
  const commentId = newEntryId(docId);
  const now = Timestamp.now();
  const comment: FieldComment = {
    id: commentId,
    type: 'comment',
    body: options.body,
    content,
    mentions,
    createdAt: now,
    createdBy: userEmail,
  };

  let participants: string[] = [];
  let reopened = false;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    if (!snapshot.exists()) {
      participants = [userEmail];
      const thread: Record<string, any> = {
        id: threadId,
        docId,
        fieldKey,
        status: 'open',
        comments: [comment],
        participants,
        createdAt: serverTimestamp(),
        createdBy: userEmail,
        updatedAt: serverTimestamp(),
        updatedBy: userEmail,
      };
      if (options.fieldLabel) {
        thread.fieldLabel = options.fieldLabel;
      }
      transaction.set(threadRef, thread);
      return;
    }

    const existing = readThread(snapshot.data() || {}, snapshot.id);
    participants = normalizeEmails([...existing.participants, userEmail]);
    const comments = [...existing.comments];
    reopened = existing.status === 'resolved';
    if (reopened) {
      comments.push({
        id: newEntryId(docId),
        type: 'reopened',
        createdAt: now,
        createdBy: userEmail,
      });
    }
    comments.push(comment);
    const update: Record<string, any> = {
      comments,
      participants,
      status: 'open',
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    };
    if (reopened) {
      update.resolvedAt = null;
      update.resolvedBy = null;
    }
    if (options.fieldLabel && !existing.fieldLabel) {
      update.fieldLabel = options.fieldLabel;
    }
    transaction.update(threadRef, update);
  });

  // A comment that reopens a resolved thread is logged as a single `add`
  // action (flagged `reopened`) so notification services don't fire twice.
  const metadata = buildActionMetadata(
    docId,
    {id: threadId, fieldKey, fieldLabel: options.fieldLabel},
    {
      commentId,
      content: truncateCommentContent(content),
      mentions,
      participants,
      ...(reopened ? {reopened: true} : {}),
    }
  );
  logAction(FIELD_COMMENT_ACTIONS.add, {metadata});
  return {threadId, commentId};
}

/** Edits the body of an existing comment. Only the author may edit. */
export async function editFieldComment(
  docId: string,
  threadId: string,
  commentId: string,
  body: RichTextData
) {
  const content = getRichTextPlainText(body);
  if (!content.trim()) {
    throw new Error('missing comment content');
  }
  const db = window.firebase.db;
  const threadRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();
  const mentions = extractRichTextMentions(body);

  const thread = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    if (!snapshot.exists()) {
      throw new Error('comment thread not found');
    }
    const existing = readThread(snapshot.data() || {}, snapshot.id);
    const index = existing.comments.findIndex((c) => c.id === commentId);
    if (index === -1) {
      throw new Error('comment not found');
    }
    const target = existing.comments[index];
    if (target.createdBy !== userEmail) {
      throw new Error('only the author can edit a comment');
    }
    const comments = [...existing.comments];
    comments[index] = {
      ...target,
      body,
      content,
      mentions,
      updatedAt: Timestamp.now(),
      updatedBy: userEmail,
    };
    transaction.update(threadRef, {
      comments,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    return existing;
  });

  logAction(FIELD_COMMENT_ACTIONS.edit, {
    metadata: buildActionMetadata(docId, thread, {
      commentId,
      content: truncateCommentContent(content),
      mentions,
      participants: thread.participants,
    }),
  });
}

/**
 * Deletes a comment. The entry is kept as a placeholder so the history stays
 * intact, unless it was the thread's only comment, in which case the whole
 * thread is removed.
 */
export async function deleteFieldComment(
  docId: string,
  threadId: string,
  commentId: string
) {
  const db = window.firebase.db;
  const threadRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();

  const thread = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    if (!snapshot.exists()) {
      throw new Error('comment thread not found');
    }
    const existing = readThread(snapshot.data() || {}, snapshot.id);
    const index = existing.comments.findIndex((c) => c.id === commentId);
    if (index === -1) {
      throw new Error('comment not found');
    }
    const target = existing.comments[index];
    if (target.createdBy !== userEmail) {
      throw new Error('only the author can delete a comment');
    }
    const remaining = getThreadComments(existing).filter(
      (c) => !c.deleted && c.id !== commentId
    );
    if (remaining.length === 0) {
      transaction.delete(threadRef);
      return existing;
    }
    const comments = [...existing.comments];
    comments[index] = {
      id: target.id,
      type: 'comment',
      body: null,
      content: '',
      mentions: [],
      createdAt: target.createdAt,
      createdBy: target.createdBy,
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: userEmail,
    };
    transaction.update(threadRef, {
      comments,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    return existing;
  });

  logAction(FIELD_COMMENT_ACTIONS.delete, {
    metadata: buildActionMetadata(docId, thread, {commentId}),
  });
}

async function setThreadStatus(
  docId: string,
  threadId: string,
  status: 'open' | 'resolved'
) {
  const db = window.firebase.db;
  const threadRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    if (!snapshot.exists()) {
      throw new Error('comment thread not found');
    }
    const existing = readThread(snapshot.data() || {}, snapshot.id);
    if (existing.status === status) {
      return null;
    }
    const comments = [
      ...existing.comments,
      {
        id: newEntryId(docId),
        type: status === 'resolved' ? 'resolved' : 'reopened',
        createdAt: Timestamp.now(),
        createdBy: userEmail,
      } as FieldComment,
    ];
    transaction.update(threadRef, {
      status,
      comments,
      resolvedAt: status === 'resolved' ? serverTimestamp() : null,
      resolvedBy: status === 'resolved' ? userEmail : null,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    return existing;
  });
}

/** Marks a thread as resolved. */
export async function resolveFieldCommentThread(
  docId: string,
  threadId: string
) {
  const thread = await setThreadStatus(docId, threadId, 'resolved');
  if (thread) {
    logAction(FIELD_COMMENT_ACTIONS.resolve, {
      metadata: buildActionMetadata(docId, thread, {
        participants: thread.participants,
      }),
    });
  }
}

/** Reopens a resolved thread. */
export async function reopenFieldCommentThread(
  docId: string,
  threadId: string
) {
  const thread = await setThreadStatus(docId, threadId, 'open');
  if (thread) {
    logAction(FIELD_COMMENT_ACTIONS.reopen, {
      metadata: buildActionMetadata(docId, thread, {
        participants: thread.participants,
      }),
    });
  }
}
