import type {RichTextData} from './richtext.js';

/**
 * Field comments let CMS users leave comments on individual fields of a doc.
 * Each field has a single thread (a flat, chronological history, no nested
 * replies) which can be resolved and later reopened.
 *
 * Threads are stored at
 * `Projects/{projectId}/Collections/{collectionId}/Drafts/{slug}/Comments/{threadId}`
 * where `threadId` is derived from a hash of the field's deep key (see
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
  /** Thread id, derived from a hash of the field key. */
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
  /**
   * Set on `add` actions when the comment reopened a resolved thread. No
   * separate `reopen` action is logged in that case.
   */
  reopened?: boolean;
  /** Plain-text content of the comment, truncated for the log. */
  content?: string;
  /** Lower-cased emails of users mentioned in the comment. */
  mentions?: string[];
  /** Lower-cased emails of everyone who has commented on the thread. */
  participants?: string[];
}

/** Max length of the plain-text comment content stored in the action log. */
export const FIELD_COMMENT_CONTENT_MAX_LENGTH = 2000;

/** Max length of the readable prefix in a thread id. */
const THREAD_ID_PREFIX_MAX_LENGTH = 24;

/** Number of hex characters of the field key hash kept in a thread id. */
const THREAD_ID_HASH_LENGTH = 24;

/**
 * Derives a firestore doc id for a field's comment thread from the field's
 * deep key (e.g. `fields.hero.title`).
 *
 * Deep keys can grow long with nested objects and arrays, and firestore caps
 * doc ids at 1,500 bytes, so the key isn't used directly. Instead the id is
 * a short readable prefix (the last segment of the key, sanitized) followed
 * by a truncated SHA-256 of the full key, e.g. `title-3f9a0c…`. The id is
 * deterministic, so a thread can be fetched by id without a query, and is
 * bounded to ~50 characters regardless of nesting depth.
 */
export async function fieldKeyToThreadId(fieldKey: string): Promise<string> {
  const key = fieldKey.trim();
  if (!key) {
    throw new Error('missing field key');
  }
  const lastSegment = key.split('.').filter(Boolean).at(-1) || '';
  const prefix = lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, THREAD_ID_PREFIX_MAX_LENGTH);
  const hash = (await sha256Hex(key)).slice(0, THREAD_ID_HASH_LENGTH);
  return prefix ? `${prefix}-${hash}` : hash;
}

/** Returns the hex-encoded SHA-256 digest of a string. */
async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('crypto.subtle is not available');
  }
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
