import type {RichTextData} from './richtext.js';

/**
 * Field comments let CMS users leave comments on individual fields of a doc.
 * Each field has a single thread (a flat, chronological history, no nested
 * replies) which can be resolved and later reopened.
 *
 * Threads are stored at
 * `Projects/{projectId}/Collections/{collectionId}/Drafts/{slug}/Comments/{threadId}`
 * where `threadId` is derived from the field's deep key (see
 * {@link fieldKeyToThreadId}).
 */

/** Minimal shape of a firestore `Timestamp` shared by the client and admin SDKs. */
export interface CommentTimestamp {
  toMillis(): number;
  toDate(): Date;
}

/** Lifecycle status of a field comment thread. */
export type FieldCommentThreadStatus = 'open' | 'resolved';

/**
 * Entries in a thread's history. `comment` entries carry a body; `resolved`
 * and `reopened` entries are system events recorded when the thread's status
 * changes.
 */
export type FieldCommentType = 'comment' | 'resolved' | 'reopened';

/** A single entry in a field comment thread. */
export interface FieldComment {
  /** Unique id of the entry within the thread. */
  id: string;
  /** Kind of entry. Defaults to `comment` when missing. */
  type?: FieldCommentType;
  /** Rich text body of the comment. */
  body?: RichTextData | null;
  /** Plain-text rendering of the body, used for previews and notifications. */
  content?: string;
  /** Lower-cased emails of users mentioned via `@mention` in the body. */
  mentions?: string[];
  createdAt: CommentTimestamp;
  createdBy: string;
  updatedAt?: CommentTimestamp;
  updatedBy?: string;
  /** Set when the comment was deleted by its author. The body is cleared. */
  deleted?: boolean;
  deletedAt?: CommentTimestamp;
  deletedBy?: string;
}

/** A thread of comments attached to a single field of a doc. */
export interface FieldCommentThread {
  /** Thread id, derived from the field key. */
  id: string;
  /** Doc id in the form `<collection>/<slug>`. */
  docId: string;
  /** Deep key of the field within the doc, e.g. `fields.hero.title`. */
  fieldKey: string;
  /** Human-readable label of the field at the time of the first comment. */
  fieldLabel?: string;
  status: FieldCommentThreadStatus;
  /** Chronological history of comments and status changes. */
  comments: FieldComment[];
  /** Lower-cased emails of everyone who has commented on the thread. */
  participants: string[];
  createdAt: CommentTimestamp;
  createdBy: string;
  updatedAt?: CommentTimestamp;
  updatedBy?: string;
  resolvedAt?: CommentTimestamp | null;
  resolvedBy?: string | null;
}

/** Action names logged for field comment activity. */
export const FIELD_COMMENT_ACTIONS = {
  add: 'doc.comment.add',
  edit: 'doc.comment.edit',
  delete: 'doc.comment.delete',
  resolve: 'doc.comment.resolve',
  reopen: 'doc.comment.reopen',
} as const;

export type FieldCommentAction =
  (typeof FIELD_COMMENT_ACTIONS)[keyof typeof FIELD_COMMENT_ACTIONS];

/**
 * Metadata attached to field comment actions in the action log. Notification
 * services (e.g. `commentEmailNotifications()`) read these values to decide
 * who to notify and what to say.
 */
export interface FieldCommentActionMetadata {
  docId: string;
  collectionId: string;
  slug: string;
  fieldKey: string;
  fieldLabel?: string;
  threadId: string;
  /** Id of the comment entry, for `add`, `edit` and `delete` actions. */
  commentId?: string;
  /** Plain-text content of the comment, truncated for the log. */
  content?: string;
  /** Lower-cased emails of users mentioned in the comment. */
  mentions?: string[];
  /** Lower-cased emails of everyone who has commented on the thread. */
  participants?: string[];
}

/** Max length of the plain-text comment content stored in the action log. */
export const FIELD_COMMENT_CONTENT_MAX_LENGTH = 2000;

/**
 * Converts a field's deep key (e.g. `fields.hero.title`) to a firestore doc
 * id. Deep keys never contain `/`, but the replacement keeps the id valid
 * regardless of where the key came from.
 */
export function fieldKeyToThreadId(fieldKey: string): string {
  const key = fieldKey.trim();
  if (!key) {
    throw new Error('missing field key');
  }
  return key.replace(/\//g, '__');
}

/** Returns true when the thread is open (has unresolved comments). */
export function isOpenThread(thread: Pick<FieldCommentThread, 'status'>) {
  return thread.status !== 'resolved';
}

/** Returns the thread's comment entries, excluding system events. */
export function getThreadComments(thread: FieldCommentThread): FieldComment[] {
  return (thread.comments || []).filter(
    (comment) => !comment.type || comment.type === 'comment'
  );
}

/** Counts the visible (non-deleted) comment entries in a thread. */
export function countThreadComments(thread: FieldCommentThread): number {
  return getThreadComments(thread).filter((comment) => !comment.deleted).length;
}

/** Trims, lower-cases and de-dupes a list of emails, dropping empty values. */
export function normalizeEmails(emails: Array<string | null | undefined>) {
  const result: string[] = [];
  emails.forEach((email) => {
    const value = (email || '').trim().toLowerCase();
    if (value && !result.includes(value)) {
      result.push(value);
    }
  });
  return result;
}

/** Truncates comment content for the action log. */
export function truncateCommentContent(
  content: string,
  maxLength = FIELD_COMMENT_CONTENT_MAX_LENGTH
) {
  const value = (content || '').trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Sorts threads for display: open threads first, then by most recent
 * activity.
 */
export function sortThreads(threads: FieldCommentThread[]) {
  return [...threads].sort((a, b) => {
    const aOpen = isOpenThread(a) ? 0 : 1;
    const bOpen = isOpenThread(b) ? 0 : 1;
    if (aOpen !== bOpen) {
      return aOpen - bOpen;
    }
    const aMillis = (a.updatedAt || a.createdAt)?.toMillis?.() || 0;
    const bMillis = (b.updatedAt || b.createdAt)?.toMillis?.() || 0;
    return bMillis - aMillis;
  });
}
