import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useMemo, useState} from 'preact/hooks';
import {
  FieldCommentThread,
  isOpenThread,
  sortThreads,
} from '../../shared/comments.js';
import {subscribeFieldCommentThreads} from '../utils/comments.js';
import {testCanEdit} from '../utils/permissions.js';
import {useProjectRoles} from './useProjectRoles.js';

/** Dispatched to toggle the comments panel on the document page. */
export const TOGGLE_COMMENTS_EVENT = 'root:toggle-comments';

/** Dispatched by the document page when the comments panel visibility changes. */
export const COMMENTS_VISIBLE_EVENT = 'root:comments-visible';

/**
 * Dispatched to open the comments panel focused on a specific field. The
 * event detail is an {@link OpenFieldCommentsEventDetail}.
 */
export const OPEN_FIELD_COMMENTS_EVENT = 'root:open-field-comments';

export interface OpenFieldCommentsEventDetail {
  fieldKey: string;
  fieldLabel?: string;
}

/** Opens the comments panel and focuses the thread for a field. */
export function openFieldCommentsPanel(detail: OpenFieldCommentsEventDetail) {
  window.dispatchEvent(
    new CustomEvent<OpenFieldCommentsEventDetail>(OPEN_FIELD_COMMENTS_EVENT, {
      detail,
    })
  );
}

export interface FieldCommentsContext {
  docId: string;
  /** All threads for the doc, open threads first. */
  threads: FieldCommentThread[];
  /** Threads keyed by field deep key. */
  threadsByFieldKey: Map<string, FieldCommentThread>;
  /** Number of open threads. */
  openCount: number;
  loading: boolean;
  error?: Error;
  /** Whether the current user may add, resolve, or reopen comments. */
  canComment: boolean;
}

const FIELD_COMMENTS_CONTEXT = createContext<FieldCommentsContext | null>(null);

export interface FieldCommentsProviderProps {
  docId: string;
  children?: ComponentChildren;
}

/**
 * Subscribes to the comment threads of a doc and shares them with the doc
 * editor (field header comment buttons) and the comments panel.
 */
export function FieldCommentsProvider(props: FieldCommentsProviderProps) {
  const {docId} = props;
  const [threads, setThreads] = useState<FieldCommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canComment = testCanEdit(roles, currentUserEmail);

  useEffect(() => {
    setLoading(true);
    setThreads([]);
    setError(undefined);
    const unsubscribe = subscribeFieldCommentThreads(
      docId,
      (next) => {
        setThreads(sortThreads(next));
        setLoading(false);
      },
      (err) => {
        console.error('failed to load field comments:', err);
        setError(err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [docId]);

  const value = useMemo<FieldCommentsContext>(() => {
    const threadsByFieldKey = new Map<string, FieldCommentThread>();
    threads.forEach((thread) => {
      threadsByFieldKey.set(thread.fieldKey, thread);
    });
    return {
      docId,
      threads,
      threadsByFieldKey,
      openCount: threads.filter(isOpenThread).length,
      loading,
      error,
      canComment,
    };
  }, [docId, threads, loading, error, canComment]);

  return (
    <FIELD_COMMENTS_CONTEXT.Provider value={value}>
      {props.children}
    </FIELD_COMMENTS_CONTEXT.Provider>
  );
}

/**
 * Returns the field comments for the current doc, or `null` when rendered
 * outside a {@link FieldCommentsProvider} (e.g. field editors in modals).
 */
export function useFieldComments(): FieldCommentsContext | null {
  return useContext(FIELD_COMMENTS_CONTEXT);
}

/** Returns the comment thread for a field, or `null` if there is none. */
export function useFieldCommentThread(
  fieldKey: string
): FieldCommentThread | null {
  const ctx = useFieldComments();
  return ctx?.threadsByFieldKey.get(fieldKey) || null;
}
