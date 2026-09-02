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
  resolvedThreadId,
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
 *
 * A field's open thread lives at a deterministic id derived from the field
 * key, so it can be read and written inside a transaction without a query.
 * Resolving a thread moves it to a timestamped id, which frees the
 * deterministic id for the field's next thread.
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

/** Subscribes to all comment threads (open and resolved) for a doc. */
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
 * Adds a comment to the field's open thread, starting a new thread when the
 * field has none. Resolved threads are never appended to; they stay archived
 * and the comment goes into a fresh thread.
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
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    const existing = snapshot.exists()
      ? readThread(snapshot.data() || {}, snapshot.id)
      : null;

    // A resolved thread at the open id is left over from an older data
    // layout; archive it so the field starts a fresh thread.
    if (existing && existing.status === 'resolved') {
      const archivedRef = threadDocRef(
        docId,
        resolvedThreadId(threadId, now.toMillis())
      );
      transaction.set(archivedRef, {...snapshot.data(), id: archivedRef.id});
    }

    if (!existing || existing.status === 'resolved') {
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
        resolvedAt: null,
        resolvedBy: null,
      };
      if (options.fieldLabel) {
        thread.fieldLabel = options.fieldLabel;
      }
      transaction.set(threadRef, thread);
      return;
    }

    participants = normalizeEmails([...existing.participants, userEmail]);
    const update: Record<string, any> = {
      comments: [...existing.comments, comment],
      participants,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    };
    if (options.fieldLabel && !existing.fieldLabel) {
      update.fieldLabel = options.fieldLabel;
    }
    transaction.update(threadRef, update);
  });

  logAction(FIELD_COMMENT_ACTIONS.add, {
    metadata: buildActionMetadata(
      docId,
      {id: threadId, fieldKey, fieldLabel: options.fieldLabel},
      {
        commentId,
        content: truncateCommentContent(content),
        mentions,
        participants,
      }
    ),
  });
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

/**
 * Marks a thread as resolved. The thread is moved from the field's open
 * thread id to a timestamped id so the field can start a new thread. Returns
 * the archived thread's id.
 */
export async function resolveFieldCommentThread(
  docId: string,
  threadId: string
) {
  const db = window.firebase.db;
  const threadRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();
  const now = Timestamp.now();
  const archivedId = resolvedThreadId(threadId, now.toMillis());
  const archivedRef = threadDocRef(docId, archivedId);

  const thread = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(threadRef);
    if (!snapshot.exists()) {
      throw new Error('comment thread not found');
    }
    const existing = readThread(snapshot.data() || {}, snapshot.id);
    if (existing.status === 'resolved') {
      return null;
    }
    transaction.set(archivedRef, {
      ...snapshot.data(),
      id: archivedId,
      status: 'resolved',
      comments: [
        ...existing.comments,
        {
          id: newEntryId(docId),
          type: 'resolved',
          createdAt: now,
          createdBy: userEmail,
        } as FieldComment,
      ],
      resolvedAt: serverTimestamp(),
      resolvedBy: userEmail,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    transaction.delete(threadRef);
    return existing;
  });

  if (thread) {
    logAction(FIELD_COMMENT_ACTIONS.resolve, {
      metadata: buildActionMetadata(
        docId,
        {...thread, id: archivedId},
        {participants: thread.participants}
      ),
    });
  }
  return thread ? archivedId : threadId;
}

/**
 * Reopens a resolved thread by moving it back to the field's open thread id.
 * Fails when the field already has an open thread; comments should go there
 * instead. Returns the reopened thread's id.
 */
export async function reopenFieldCommentThread(
  docId: string,
  threadId: string
) {
  const db = window.firebase.db;
  const archivedRef = threadDocRef(docId, threadId);
  const userEmail = currentUserEmail();
  const now = Timestamp.now();

  // The field key is needed to derive the open id, so read the thread first.
  // The transaction re-reads it to guard against concurrent changes.
  const archivedSnapshot = await runTransaction(db, (transaction) =>
    transaction.get(archivedRef)
  );
  if (!archivedSnapshot.exists()) {
    throw new Error('comment thread not found');
  }
  const archived = readThread(archivedSnapshot.data() || {}, threadId);
  if (archived.status !== 'resolved') {
    return threadId;
  }
  const openId = await fieldKeyToThreadId(archived.fieldKey);
  const openRef = threadDocRef(docId, openId);

  const thread = await runTransaction(db, async (transaction) => {
    const [snapshot, openSnapshot] = await Promise.all([
      transaction.get(archivedRef),
      transaction.get(openRef),
    ]);
    if (!snapshot.exists()) {
      throw new Error('comment thread not found');
    }
    if (openSnapshot.exists()) {
      throw new Error(
        'This field already has an open thread. Add your comment there instead.'
      );
    }
    const existing = readThread(snapshot.data() || {}, snapshot.id);
    transaction.set(openRef, {
      ...snapshot.data(),
      id: openId,
      status: 'open',
      comments: [
        ...existing.comments,
        {
          id: newEntryId(docId),
          type: 'reopened',
          createdAt: now,
          createdBy: userEmail,
        } as FieldComment,
      ],
      resolvedAt: null,
      resolvedBy: null,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail,
    });
    transaction.delete(archivedRef);
    return existing;
  });

  logAction(FIELD_COMMENT_ACTIONS.reopen, {
    metadata: buildActionMetadata(
      docId,
      {...thread, id: openId},
      {participants: thread.participants}
    ),
  });
  return openId;
}
