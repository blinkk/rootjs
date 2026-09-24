import './PinnedCommentThreads.css';

import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconGripHorizontal, IconX} from '@tabler/icons-preact';
import {createPortal} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  FieldCommentsProvider,
  useFieldComments,
  useFieldCommentThread,
  useFieldResolvedThreads,
} from '../../hooks/useFieldComments.js';
import {
  PinnedCommentThread,
  pinnedThreadKey,
  usePinnedCommentThreads,
} from '../../hooks/usePinnedCommentThreads.js';
import {joinClassNames} from '../../utils/classes.js';
import {CommentThread} from '../CommentThread/CommentThread.js';

/** Width of a pinned comment window, in px. */
export const PINNED_COMMENT_WINDOW_WIDTH = 380;

/** Min distance kept between a pinned window and the viewport edges. */
const VIEWPORT_MARGIN = 8;

/** Min height of a pinned window kept within the viewport when dragging. */
const MIN_VISIBLE_HEIGHT = 40;

/** Distance a pinned window moves per arrow key press on its drag handle. */
const KEYBOARD_STEP = 16;

/** Keeps a pinned window's position within the viewport. */
export function clampPinnedWindowPosition(x: number, y: number) {
  const maxX = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - PINNED_COMMENT_WINDOW_WIDTH - VIEWPORT_MARGIN
  );
  const maxY = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - MIN_VISIBLE_HEIGHT - VIEWPORT_MARGIN
  );
  return {
    x: Math.round(Math.min(Math.max(x, VIEWPORT_MARGIN), maxX)),
    y: Math.round(Math.min(Math.max(y, VIEWPORT_MARGIN), maxY)),
  };
}

/**
 * Renders the field comment threads the user has pinned as floating windows
 * that stay fixed in the viewport while the user edits and navigates around
 * the CMS. Each window can be dragged by its title bar.
 */
export function PinnedCommentThreads() {
  const ctx = usePinnedCommentThreads();
  const {path} = useLocation();

  // Keep windows within the viewport when the browser is resized.
  const [, setViewportSize] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportSize(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Embedded pages render inside another tool's iframe, which shouldn't show
  // the host CMS's pinned windows.
  if (!ctx || ctx.pinned.length === 0 || path.startsWith('/cms/embed/')) {
    return null;
  }

  return createPortal(
    <div className="PinnedCommentThreads">
      {ctx.pinned.map((item) => (
        <PinnedCommentWindow
          key={pinnedThreadKey(item.docId, item.fieldKey)}
          item={item}
        />
      ))}
    </div>,
    document.body
  );
}

interface PinnedCommentWindowProps {
  item: PinnedCommentThread;
}

/** A single draggable pinned comment thread window. */
function PinnedCommentWindow(props: PinnedCommentWindowProps) {
  const {docId, fieldKey} = props.item;
  const ctx = usePinnedCommentThreads()!;
  const windowRef = useRef<HTMLDivElement>(null);
  const [dragPosition, setDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [flash, setFlash] = useState(false);
  const key = pinnedThreadKey(docId, fieldKey);

  // Briefly highlight the window when it's focused from the doc editor.
  const focusRequest = ctx.focusRequest;
  useEffect(() => {
    if (!focusRequest || focusRequest.key !== key) {
      return;
    }
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 800);
    return () => window.clearTimeout(timer);
  }, [focusRequest, key]);

  const position =
    dragPosition || clampPinnedWindowPosition(props.item.x, props.item.y);
  // Tracks the latest requested position so repeated key presses that land
  // before a re-render accumulate.
  const positionRef = useRef(position);
  positionRef.current = position;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea')) {
      return;
    }
    const el = windowRef.current;
    if (!el) {
      return;
    }
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    // Capturing the pointer keeps the drag going when it passes over an
    // iframe (e.g. the doc preview), which would otherwise swallow events.
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may no longer be active.
    }
    let latest = {x: rect.left, y: rect.top};

    const onPointerMove = (ev: PointerEvent) => {
      latest = clampPinnedWindowPosition(
        ev.clientX - offsetX,
        ev.clientY - offsetY
      );
      setDragPosition(latest);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      ctx.move(docId, fieldKey, latest.x, latest.y);
      setDragPosition(null);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onHandleKeyDown(e: KeyboardEvent) {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP],
    };
    const delta = deltas[e.key];
    if (!delta) {
      return;
    }
    e.preventDefault();
    const next = clampPinnedWindowPosition(
      positionRef.current.x + delta[0],
      positionRef.current.y + delta[1]
    );
    positionRef.current = next;
    ctx.move(docId, fieldKey, next.x, next.y);
  }

  return (
    <div
      ref={windowRef}
      className={joinClassNames(
        'PinnedCommentThreads__window',
        dragPosition && 'PinnedCommentThreads__window--dragging',
        flash && 'PinnedCommentThreads__window--flash'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${PINNED_COMMENT_WINDOW_WIDTH}px`,
        zIndex: props.item.z || 0,
      }}
      role="dialog"
      aria-label={`Comments: ${props.item.fieldLabel}`}
      onPointerDown={() => ctx.bringToFront(docId, fieldKey)}
    >
      <div
        className="PinnedCommentThreads__window__titleBar"
        onPointerDown={onPointerDown}
      >
        <div
          className="PinnedCommentThreads__window__handle"
          tabIndex={0}
          role="button"
          aria-label="Move comment window (use arrow keys)"
          onKeyDown={onHandleKeyDown}
        >
          <IconGripHorizontal size={14} strokeWidth="1.8" />
        </div>
        <div className="PinnedCommentThreads__window__docId" title={docId}>
          {docId}
        </div>
        <Tooltip label="Unpin" withArrow>
          <ActionIcon
            size="sm"
            aria-label="Unpin"
            onClick={() => ctx.unpin(docId, fieldKey)}
          >
            <IconX size={16} strokeWidth="1.8" />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className="PinnedCommentThreads__window__body">
        <FieldCommentsProvider docId={docId}>
          <PinnedCommentWindowThread item={props.item} />
        </FieldCommentsProvider>
      </div>
    </div>
  );
}

interface PinnedCommentWindowThreadProps {
  item: PinnedCommentThread;
}

/** The comment thread shown in a pinned window. */
function PinnedCommentWindowThread(props: PinnedCommentWindowThreadProps) {
  const {docId, fieldKey, fieldLabel} = props.item;
  const comments = useFieldComments()!;
  const thread = useFieldCommentThread(fieldKey);
  const resolvedThreads = useFieldResolvedThreads(fieldKey);
  const {path, route} = useLocation();
  const docPath = `/cms/content/${docId}`;
  const onDocPage = path === docPath;

  if (comments.loading) {
    return (
      <div className="PinnedCommentThreads__window__loading">
        <Loader size="sm" color="gray" />
      </div>
    );
  }

  function goToField() {
    if (onDocPage) {
      // Reuses the `scrollToDeeplink` postMessage handler in the doc editor.
      window.postMessage({scrollToDeeplink: {deepKey: fieldKey}}, '*');
      return;
    }
    route(`${docPath}?deeplink=${encodeURIComponent(fieldKey)}`);
  }

  return (
    <CommentThread
      docId={docId}
      fieldKey={fieldKey}
      fieldLabel={fieldLabel}
      thread={thread}
      onNavigate={goToField}
      // The resolved threads link opens the doc page's comments panel, so
      // it's only shown while that page is open.
      resolvedCount={onDocPage ? resolvedThreads.length : 0}
    />
  );
}
