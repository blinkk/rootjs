import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useMemo, useState} from 'preact/hooks';

/** A field comment thread pinned to a floating window in the viewport. */
export interface PinnedCommentThread {
  /** Doc the thread belongs to, e.g. `Pages/index`. */
  docId: string;
  /** Deep key of the field the thread belongs to. */
  fieldKey: string;
  /** Display label for the field, e.g. `Sections › #2 › Title`. */
  fieldLabel: string;
  /** Left offset of the window within the viewport, in px. */
  x: number;
  /** Top offset of the window within the viewport, in px. */
  y: number;
  /** Stacking order of the window; higher values render on top. */
  z?: number;
}

export interface PinnedCommentThreadsContext {
  /** Pinned threads, in the order they were pinned. */
  pinned: PinnedCommentThread[];
  /**
   * The most recent request to draw attention to a pinned window. The `id`
   * changes on every request so repeated requests for the same window can be
   * detected.
   */
  focusRequest: {key: string; id: number} | null;
  isPinned: (docId: string, fieldKey: string) => boolean;
  /** Pins a thread, or moves it to the front if it's already pinned. */
  pin: (thread: PinnedCommentThread) => void;
  unpin: (docId: string, fieldKey: string) => void;
  move: (docId: string, fieldKey: string, x: number, y: number) => void;
  /** Moves a pinned window to the front. */
  bringToFront: (docId: string, fieldKey: string) => void;
  /** Moves a pinned window to the front and briefly highlights it. */
  focus: (docId: string, fieldKey: string) => void;
}

const STORAGE_KEY = 'root::PinnedCommentThreads';

const PINNED_COMMENT_THREADS_CONTEXT =
  createContext<PinnedCommentThreadsContext | null>(null);

/** Returns a unique key for a pinned thread. */
export function pinnedThreadKey(docId: string, fieldKey: string) {
  return `${docId}#${fieldKey}`;
}

function loadPinned(): PinnedCommentThread[] {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item) =>
        item &&
        typeof item.docId === 'string' &&
        typeof item.fieldKey === 'string' &&
        typeof item.x === 'number' &&
        typeof item.y === 'number'
    );
  } catch {
    return [];
  }
}

function savePinned(pinned: PinnedCommentThread[]) {
  try {
    if (pinned.length > 0) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable (e.g. blocked site data); pins still work
    // for the lifetime of the page.
  }
}

export interface PinnedCommentThreadsProviderProps {
  children?: ComponentChildren;
}

/**
 * Tracks the field comment threads the user has pinned to floating windows.
 * Pins live at the app level so they stay open while the user navigates
 * around the CMS, and are kept in session storage so they survive a reload.
 */
export function PinnedCommentThreadsProvider(
  props: PinnedCommentThreadsProviderProps
) {
  const [pinned, setPinned] = useState<PinnedCommentThread[]>(loadPinned);
  const [focusRequest, setFocusRequest] =
    useState<PinnedCommentThreadsContext['focusRequest']>(null);

  useEffect(() => {
    savePinned(pinned);
  }, [pinned]);

  const value = useMemo<PinnedCommentThreadsContext>(() => {
    const matches =
      (docId: string, fieldKey: string) => (item: PinnedCommentThread) =>
        item.docId === docId && item.fieldKey === fieldKey;

    // Windows keep their DOM order (reordering would blur a focused
    // composer), so stacking is tracked separately via `z`.
    const bringToFront = (docId: string, fieldKey: string) => {
      setPinned((current) => {
        const maxZ = Math.max(...current.map((i) => i.z || 0));
        const item = current.find(matches(docId, fieldKey));
        if (!item || (item.z || 0) === maxZ) {
          return current;
        }
        return current.map((i) => (i === item ? {...i, z: maxZ + 1} : i));
      });
    };

    return {
      pinned,
      focusRequest,
      isPinned: (docId, fieldKey) => pinned.some(matches(docId, fieldKey)),
      pin: (thread) => {
        setPinned((current) => {
          const z = Math.max(0, ...current.map((i) => i.z || 0)) + 1;
          const exists = current.some(matches(thread.docId, thread.fieldKey));
          if (exists) {
            return current.map((i) =>
              matches(thread.docId, thread.fieldKey)(i) ? {...thread, z} : i
            );
          }
          return [...current, {...thread, z}];
        });
      },
      unpin: (docId, fieldKey) => {
        setPinned((current) =>
          current.filter((i) => !matches(docId, fieldKey)(i))
        );
      },
      move: (docId, fieldKey, x, y) => {
        setPinned((current) =>
          current.map((i) => (matches(docId, fieldKey)(i) ? {...i, x, y} : i))
        );
      },
      bringToFront,
      focus: (docId, fieldKey) => {
        bringToFront(docId, fieldKey);
        setFocusRequest((current) => ({
          key: pinnedThreadKey(docId, fieldKey),
          id: (current?.id || 0) + 1,
        }));
      },
    };
  }, [pinned, focusRequest]);

  return (
    <PINNED_COMMENT_THREADS_CONTEXT.Provider value={value}>
      {props.children}
    </PINNED_COMMENT_THREADS_CONTEXT.Provider>
  );
}

/**
 * Returns the pinned comment threads, or `null` when rendered outside a
 * {@link PinnedCommentThreadsProvider}.
 */
export function usePinnedCommentThreads(): PinnedCommentThreadsContext | null {
  return useContext(PINNED_COMMENT_THREADS_CONTEXT);
}
