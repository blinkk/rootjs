import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import type {
  PrototypeAnnotation,
  PrototypeAnnotationKind,
  PrototypeBlock,
  PrototypeBlockMap,
  PrototypeBoardBundle,
  PrototypeBoardPage,
  PrototypeBoardStatus,
  PrototypeBoardSummary,
  PrototypeCommentAnchor,
  PrototypeCommentThread,
  PrototypeComponentSpec,
  PrototypeFrame,
  PrototypeProjectContext,
  SiteSchemaSummary,
} from '../../../shared/prototypes.js';
import {getOrderedBlocks} from '../../../shared/prototypes.js';
import {autokey} from '../../utils/rand.js';
import {
  apiAddPrototypeComment,
  apiDeletePrototypeAnnotation,
  apiDeletePrototypeBoard,
  apiDeletePrototypeComment,
  apiDeletePrototypeFrame,
  apiDuplicatePrototypeBoard,
  apiGetPrototypeBoard,
  apiGetPrototypeContext,
  apiMovePrototypeComment,
  apiMovePrototypeItems,
  apiSavePrototypeAnnotation,
  apiSavePrototypeFrame,
  apiSetPrototypeCommentStatus,
  apiUpdatePrototypeBoard,
} from './prototypes-client.js';

/** Horizontal gap in world px between newly auto-placed frames. */
const FRAME_AUTO_SPACING_X = 80;

/** Default width in CSS px for newly created desktop frames. */
const DEFAULT_FRAME_WIDTH = 1440;

/** Default initial Y coordinate in world px for frames on an empty page. */
const DEFAULT_FRAME_Y = 80;

/** Default initial X coordinate in world px for frames on an empty page. */
const DEFAULT_FRAME_X = 80;

/** Maximum number of canvas undo checkpoints retained in memory per board. */
const MAX_UNDO_HISTORY = 40;

/** Immutable snapshot of canvas frames and annotations used for undo/redo. */
interface BoardHistorySnapshot {
  frames: PrototypeFrame[];
  annotations: PrototypeAnnotation[];
}

function cloneHistorySnapshot(
  snapshot: BoardHistorySnapshot
): BoardHistorySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BoardHistorySnapshot;
}

function extractHistorySnapshot(
  bundle: PrototypeBoardBundle
): BoardHistorySnapshot {
  return cloneHistorySnapshot({
    frames: bundle.frames || [],
    annotations: bundle.annotations || [],
  });
}

function frameContentSignature(frame: PrototypeFrame): string {
  return JSON.stringify({
    pageId: frame.pageId,
    title: frame.title,
    width: frame.width,
    blocks: frame.blocks,
    sortOrder: frame.sortOrder || '',
  });
}

function annotationContentSignature(annotation: PrototypeAnnotation): string {
  return JSON.stringify({
    pageId: annotation.pageId,
    kind: annotation.kind,
    text: annotation.text,
    width: annotation.width || 0,
  });
}

function snapshotsMateriallyEqual(
  a: BoardHistorySnapshot,
  b: BoardHistorySnapshot
): boolean {
  if (
    a.frames.length !== b.frames.length ||
    a.annotations.length !== b.annotations.length
  ) {
    return false;
  }
  for (let i = 0; i < a.frames.length; i++) {
    const fa = a.frames[i];
    const fb = b.frames[i];
    if (
      fa.id !== fb.id ||
      fa.x !== fb.x ||
      fa.y !== fb.y ||
      frameContentSignature(fa) !== frameContentSignature(fb)
    ) {
      return false;
    }
  }
  for (let i = 0; i < a.annotations.length; i++) {
    const aa = a.annotations[i];
    const ab = b.annotations[i];
    if (
      aa.id !== ab.id ||
      aa.x !== ab.x ||
      aa.y !== ab.y ||
      annotationContentSignature(aa) !== annotationContentSignature(ab)
    ) {
      return false;
    }
  }
  return true;
}

/** Computes a non-overlapping `(x, y)` coordinate to the right of existing frames on a page. */
export function computeNextFramePosition(
  frames: PrototypeFrame[],
  pageId: string
): {x: number; y: number} {
  const pageFrames = frames.filter((frame) => frame.pageId === pageId);
  if (pageFrames.length === 0) {
    return {x: DEFAULT_FRAME_X, y: DEFAULT_FRAME_Y};
  }
  let maxRight = -Infinity;
  let baselineY = pageFrames[0].y;
  for (const frame of pageFrames) {
    const right = frame.x + frame.width;
    if (right > maxRight) {
      maxRight = right;
      baselineY = frame.y;
    }
  }
  return {
    x: Math.round(maxRight + FRAME_AUTO_SPACING_X),
    y: Math.round(baselineY),
  };
}

/** Converts a page display name into a unique URL-safe `pageId`. */
function slugifyPageId(
  name: string,
  existingPages: PrototypeBoardPage[]
): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'page';
  const taken = new Set(existingPages.map((page) => page.id));
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

/** Escapes text for safe interpolation into fallback wireframe HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates clean fallback Tailwind wireframe HTML for an existing project
 * schema when no cached Visual Twin exists yet.
 */
export function buildFallbackBlockHtml(schema: SiteSchemaSummary): string {
  const title = escapeHtml(schema.label || schema.name);
  const desc = escapeHtml(
    schema.description ||
      `Placeholder layout for ${schema.label || schema.name}.`
  );
  const fieldNames = schema.fields.map((field) => field.id.toLowerCase());
  const hasList = schema.fields.some(
    (field) =>
      field.type === 'array' || /items|cards|tiers|features/.test(field.id)
  );
  const hasImage = schema.fields.some(
    (field) => field.type === 'image' || /image|media|photo/.test(field.id)
  );
  const hasCta = fieldNames.some((id) => /cta|button|link/.test(id));

  if (hasList) {
    return [
      '<div class="mx-auto max-w-6xl px-6 py-16">',
      `  <div class="mb-10 max-w-2xl"><p class="text-xs font-semibold uppercase tracking-wider opacity-60">${title}</p><h2 class="mt-2 text-3xl font-semibold tracking-tight">${title}</h2><p class="mt-3 text-base opacity-75">${desc}</p></div>`,
      '  <div class="grid grid-cols-1 gap-6 md:grid-cols-3">',
      '    <div class="rounded-xl border border-black/10 bg-black/[0.02] p-6"><div class="h-4 w-24 rounded bg-black/10"></div><h3 class="mt-4 text-lg font-semibold">Option A</h3><p class="mt-2 text-sm opacity-70">Supporting summary copy for this card item.</p></div>',
      '    <div class="rounded-xl border border-black/10 bg-black/[0.02] p-6"><div class="h-4 w-24 rounded bg-black/10"></div><h3 class="mt-4 text-lg font-semibold">Option B</h3><p class="mt-2 text-sm opacity-70">Supporting summary copy for this card item.</p></div>',
      '    <div class="rounded-xl border border-black/10 bg-black/[0.02] p-6"><div class="h-4 w-24 rounded bg-black/10"></div><h3 class="mt-4 text-lg font-semibold">Option C</h3><p class="mt-2 text-sm opacity-70">Supporting summary copy for this card item.</p></div>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  return [
    '<div class="mx-auto max-w-6xl px-6 py-16">',
    hasImage
      ? '  <div class="grid grid-cols-1 items-center gap-10 md:grid-cols-2">'
      : '  <div class="max-w-3xl">',
    '    <div>',
    `      <p class="text-xs font-semibold uppercase tracking-wider opacity-60">${title}</p>`,
    `      <h2 class="mt-2 text-3xl font-semibold tracking-tight">${title}</h2>`,
    `      <p class="mt-4 text-base leading-relaxed opacity-75">${desc}</p>`,
    hasCta
      ? '      <div class="mt-6 flex flex-wrap gap-3"><span class="inline-flex items-center rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white">Primary action</span><span class="inline-flex items-center rounded-lg border border-black/20 px-5 py-2.5 text-sm font-medium">Learn more</span></div>'
      : '',
    '    </div>',
    hasImage
      ? '    <div class="flex aspect-[16/10] items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/[0.03] text-sm opacity-50">Media preview</div>'
      : '',
    '  </div>',
    '</div>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Defaults `annotations` for a bundle from a server that predates them. */
function withAnnotations(bundle: PrototypeBoardBundle): PrototypeBoardBundle {
  return Array.isArray(bundle.annotations)
    ? bundle
    : {...bundle, annotations: []};
}

/** Return shape of `usePrototypeBoard`. */
export interface UsePrototypeBoardResult {
  /** Hydrated prototype board bundle, or `null` before first load. */
  bundle: PrototypeBoardBundle | null;
  /** True while the initial board fetch is in flight. */
  loading: boolean;
  /** Initial load error, if any. */
  error: unknown;
  /** Read-only project schemas and extracted design tokens. */
  projectContext: PrototypeProjectContext | null;
  /** Reloads the entire board bundle from the server. */
  reload: () => Promise<void>;
  /** Renames the board title. */
  renameBoard: (title: string) => Promise<void>;
  /** Updates board archive/active status. */
  updateBoardStatus: (status: PrototypeBoardStatus) => Promise<void>;
  /** Appends a new page to `board.pages` and returns it. */
  addPage: (name: string) => Promise<PrototypeBoardPage | null>;
  /** Renames an existing page in `board.pages` while preserving its `id`. */
  renamePage: (pageId: string, name: string) => Promise<void>;
  /** Duplicates the current board and returns the new summary. */
  duplicateBoard: () => Promise<PrototypeBoardSummary>;
  /** Permanently deletes the current board. */
  deleteBoard: () => Promise<void>;
  /** Creates a new frame on `pageId` spaced cleanly to the right of existing frames. */
  createFrame: (options: {
    pageId: string;
    title?: string;
    width?: number;
    x?: number;
    y?: number;
    blocks?: PrototypeBlockMap;
  }) => Promise<PrototypeFrame>;
  /** Saves partial updates to an existing frame with optimistic state updates. */
  saveFrame: (
    frame: Partial<PrototypeFrame> & {id: string}
  ) => Promise<PrototypeFrame>;
  /** Clones an existing frame cleanly to the right of frames on its page. */
  duplicateFrame: (frameId: string) => Promise<PrototypeFrame | null>;
  /** Deletes a frame from the board. */
  deleteFrame: (frameId: string) => Promise<void>;
  /** Moves a frame onto another page at a non-overlapping coordinate. */
  moveFrameToPage: (frameId: string, pageId: string) => Promise<void>;
  /** Updates a frame's `(x, y)` coordinates during or after dragging. */
  updateFramePosition: (
    frameId: string,
    x: number,
    y: number,
    persist?: boolean
  ) => void;
  /** Caches the latest measured height for a frame in local state. */
  updateFrameCachedHeight: (frameId: string, height: number) => void;
  /** Appends a new block to a frame and persists it. */
  insertBlockIntoFrame: (
    frameId: string,
    block: PrototypeBlock
  ) => Promise<{frame: PrototypeFrame; blockKey: string}>;
  /** Adds a reply to an existing comment thread or creates a new anchored thread. */
  addComment: (input: {
    threadId?: string;
    anchor?: PrototypeCommentAnchor;
    anchorLabel?: string;
    body: string;
    content: string;
    mentions?: string[];
  }) => Promise<PrototypeCommentThread>;
  /** Marks a comment thread resolved or open. */
  setCommentStatus: (
    threadId: string,
    status: 'open' | 'resolved'
  ) => Promise<PrototypeCommentThread>;
  /** Moves a comment thread's pin anchor during or after dragging. */
  updateCommentAnchor: (
    threadId: string,
    anchor: PrototypeCommentAnchor,
    anchorLabel: string,
    persist?: boolean
  ) => void;
  /** Deletes a comment item (or thread if it was the first comment). */
  deleteComment: (threadId: string, commentId: string) => Promise<void>;
  /** Adds a note or text label to the canvas, showing it before it saves. */
  createAnnotation: (input: {
    id?: string;
    pageId: string;
    kind: PrototypeAnnotationKind;
    text: string;
    x: number;
    y: number;
  }) => Promise<PrototypeAnnotation>;
  /**
   * Applies a partial change to an annotation right away. Unless
   * `persist` is false (a drag in progress) the change is saved, and rolled
   * back to the last saved state if the save fails.
   */
  updateAnnotation: (
    patch: Partial<PrototypeAnnotation> & {id: string},
    options?: {persist?: boolean}
  ) => Promise<void>;
  /** Deletes an annotation, restoring it if the delete fails. */
  deleteAnnotation: (annotationId: string) => Promise<void>;
  /** Deletes multiple annotations as a single undoable step. */
  deleteAnnotations: (annotationIds: string[]) => Promise<void>;
  /** Moves multiple frames and/or annotations together in a single batch. */
  moveItems: (
    moves: {
      frames?: Array<{id: string; x: number; y: number}>;
      annotations?: Array<{id: string; x: number; y: number}>;
    },
    persist?: boolean
  ) => Promise<void>;
  /** True when at least one canvas mutation can be undone. */
  canUndo: boolean;
  /** True when at least one undone canvas mutation can be redone. */
  canRedo: boolean;
  /** Reverts the last canvas frame/annotation mutation. */
  undo: () => Promise<void>;
  /** Reapplies the most recently undone canvas mutation. */
  redo: () => Promise<void>;
  /** Integrates a frame mutation performed by Root AI into local state. */
  applyFrameMutated: (frame: PrototypeFrame) => void;
  /** Integrates an annotation saved by Root AI into local state. */
  applyAnnotationMutated: (annotation: PrototypeAnnotation) => void;
  /** Integrates a component spec mutation performed by Root AI into local state. */
  applyComponentMutated: (spec: PrototypeComponentSpec) => void;
  /** Reloads the board after an AI turn finishes so local state stays in sync. */
  refreshAfterAiTurn: () => void;
  /** Records the board's linked AI chat locally (empty string unlinks it). */
  setBoardAiChatId: (chatId: string) => void;
}

/**
 * Loads and manages the full reactive state for a prototype board canvas,
 * including optimistic frame updates, pages, comments, and project schemas.
 */
export function usePrototypeBoard(boardId: string): UsePrototypeBoardResult {
  const [bundle, setBundle] = useState<PrototypeBoardBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [projectContext, setProjectContext] =
    useState<PrototypeProjectContext | null>(null);
  const [historyCounts, setHistoryCounts] = useState({undo: 0, redo: 0});
  const bundleRef = useRef<PrototypeBoardBundle | null>(null);
  bundleRef.current = bundle;
  const committedSnapshotRef = useRef<BoardHistorySnapshot | null>(null);
  const undoStackRef = useRef<BoardHistorySnapshot[]>([]);
  const redoStackRef = useRef<BoardHistorySnapshot[]>([]);
  const aiTurnCapturedRef = useRef(false);

  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
  }, []);

  const commitNextSnapshot = useCallback(
    (nextSnapshot: BoardHistorySnapshot) => {
      const prevCommitted = committedSnapshotRef.current;
      if (
        prevCommitted &&
        !snapshotsMateriallyEqual(prevCommitted, nextSnapshot)
      ) {
        undoStackRef.current.push(cloneHistorySnapshot(prevCommitted));
        if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        syncHistoryCounts();
      }
      committedSnapshotRef.current = cloneHistorySnapshot(nextSnapshot);
    },
    [syncHistoryCounts]
  );

  const captureAiTurnCheckpoint = useCallback(() => {
    if (aiTurnCapturedRef.current || !committedSnapshotRef.current) {
      return;
    }
    aiTurnCapturedRef.current = true;
    undoStackRef.current.push(
      cloneHistorySnapshot(committedSnapshotRef.current)
    );
    if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const reload = useCallback(async () => {
    if (!boardId) {
      return;
    }
    try {
      const next = withAnnotations(await apiGetPrototypeBoard(boardId));
      setBundle(next);
      committedSnapshotRef.current = extractHistorySnapshot(next);
      aiTurnCapturedRef.current = false;
      setError(null);
    } catch (err) {
      setError(err);
      throw err;
    }
  }, [boardId]);

  useEffect(() => {
    if (!boardId) {
      setLoading(false);
      setError(new Error('Missing prototype board ID.'));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    committedSnapshotRef.current = null;
    aiTurnCapturedRef.current = false;
    syncHistoryCounts();

    apiGetPrototypeBoard(boardId)
      .then((raw) => {
        if (!cancelled) {
          const next = withAnnotations(raw);
          setBundle(next);
          committedSnapshotRef.current = extractHistorySnapshot(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    apiGetPrototypeContext()
      .then((ctx) => {
        if (!cancelled) {
          setProjectContext(ctx);
        }
      })
      .catch((err) => {
        // Project context is optional for viewing frames; log quietly.
        console.warn('Could not load prototype project context:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const renameBoard = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        return;
      }
      const updated = await apiUpdatePrototypeBoard({boardId, title: trimmed});
      setBundle((prev) => (prev ? {...prev, board: updated} : prev));
    },
    [boardId]
  );

  const updateBoardStatus = useCallback(
    async (status: PrototypeBoardStatus) => {
      const updated = await apiUpdatePrototypeBoard({boardId, status});
      setBundle((prev) => (prev ? {...prev, board: updated} : prev));
    },
    [boardId]
  );

  const addPage = useCallback(
    async (name: string): Promise<PrototypeBoardPage | null> => {
      const current = bundleRef.current;
      const trimmed = name.trim();
      if (!current || !trimmed) {
        return null;
      }
      const page: PrototypeBoardPage = {
        id: slugifyPageId(trimmed, current.board.pages),
        name: trimmed,
      };
      const updated = await apiUpdatePrototypeBoard({
        boardId,
        pages: [...current.board.pages, page],
      });
      setBundle((prev) => (prev ? {...prev, board: updated} : prev));
      return page;
    },
    [boardId]
  );

  const renamePage = useCallback(
    async (pageId: string, name: string): Promise<void> => {
      const current = bundleRef.current;
      const trimmed = name.trim();
      if (!current || !trimmed) {
        return;
      }
      const nextPages = current.board.pages.map((page) =>
        page.id === pageId ? {...page, name: trimmed} : page
      );
      const updated = await apiUpdatePrototypeBoard({
        boardId,
        pages: nextPages,
      });
      setBundle((prev) => (prev ? {...prev, board: updated} : prev));
    },
    [boardId]
  );

  const duplicateBoard = useCallback(async () => {
    return apiDuplicatePrototypeBoard({boardId});
  }, [boardId]);

  const deleteBoard = useCallback(async () => {
    await apiDeletePrototypeBoard(boardId);
  }, [boardId]);

  const createFrame = useCallback(
    async (options: {
      pageId: string;
      title?: string;
      width?: number;
      x?: number;
      y?: number;
      blocks?: PrototypeBlockMap;
    }): Promise<PrototypeFrame> => {
      const current = bundleRef.current;
      const existingFrames = current?.frames || [];
      const pageFrames = existingFrames.filter(
        (frame) => frame.pageId === options.pageId
      );
      const pos = computeNextFramePosition(existingFrames, options.pageId);
      const frameId = `frame-${autokey(8).toLowerCase()}`;
      const title = options.title?.trim() || `Frame ${pageFrames.length + 1}`;
      const saved = await apiSavePrototypeFrame({
        boardId,
        frame: {
          id: frameId,
          boardId,
          pageId: options.pageId,
          title,
          width: options.width ?? DEFAULT_FRAME_WIDTH,
          x: options.x ?? pos.x,
          y: options.y ?? pos.y,
          blocks: options.blocks ?? {_array: []},
        },
      });
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.frames.some((frame) => frame.id === saved.id);
        const nextFrames = exists
          ? prev.frames.map((frame) => (frame.id === saved.id ? saved : frame))
          : [...prev.frames, saved];
        commitNextSnapshot({frames: nextFrames, annotations: prev.annotations});
        return {
          ...prev,
          frames: nextFrames,
        };
      });
      return saved;
    },
    [boardId, commitNextSnapshot]
  );

  const saveFrame = useCallback(
    async (
      frameUpdate: Partial<PrototypeFrame> & {id: string}
    ): Promise<PrototypeFrame> => {
      const prevFrames = bundleRef.current?.frames || [];
      // Optimistically apply changes for snappy canvas feedback.
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          frames: prev.frames.map((frame) =>
            frame.id === frameUpdate.id ? {...frame, ...frameUpdate} : frame
          ),
        };
      });
      try {
        const saved = await apiSavePrototypeFrame({
          boardId,
          frame: frameUpdate,
        });
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          const exists = prev.frames.some((frame) => frame.id === saved.id);
          const nextFrames = exists
            ? prev.frames.map((frame) =>
                frame.id === saved.id ? saved : frame
              )
            : [...prev.frames, saved];
          commitNextSnapshot({
            frames: nextFrames,
            annotations: prev.annotations,
          });
          return {
            ...prev,
            frames: nextFrames,
          };
        });
        return saved;
      } catch (err) {
        setBundle((prev) => (prev ? {...prev, frames: prevFrames} : prev));
        throw err;
      }
    },
    [boardId, commitNextSnapshot]
  );

  const duplicateFrame = useCallback(
    async (frameId: string): Promise<PrototypeFrame | null> => {
      const current = bundleRef.current;
      const source = current?.frames.find((frame) => frame.id === frameId);
      if (!current || !source) {
        return null;
      }
      const pos = computeNextFramePosition(current.frames, source.pageId);
      const nextBlocks: PrototypeBlockMap = {_array: []};
      for (const {block} of getOrderedBlocks(source.blocks)) {
        const key = `blk-${autokey(6).toLowerCase()}`;
        nextBlocks._array.push(key);
        nextBlocks[key] = {...block};
      }
      return createFrame({
        pageId: source.pageId,
        title: `${source.title} copy`,
        width: source.width,
        x: pos.x,
        y: pos.y,
        blocks: nextBlocks,
      });
    },
    [createFrame]
  );

  const deleteFrame = useCallback(
    async (frameId: string) => {
      const prevFrames = bundleRef.current?.frames || [];
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              frames: prev.frames.filter((frame) => frame.id !== frameId),
            }
          : prev
      );
      try {
        await apiDeletePrototypeFrame({boardId, frameId});
        const latest = bundleRef.current;
        if (latest) {
          commitNextSnapshot({
            frames: latest.frames,
            annotations: latest.annotations,
          });
        }
      } catch (err) {
        setBundle((prev) => (prev ? {...prev, frames: prevFrames} : prev));
        throw err;
      }
    },
    [boardId, commitNextSnapshot]
  );

  const moveFrameToPage = useCallback(
    async (frameId: string, pageId: string) => {
      const current = bundleRef.current;
      const frame = current?.frames.find((item) => item.id === frameId);
      if (!current || !frame || frame.pageId === pageId) {
        return;
      }
      const pos = computeNextFramePosition(current.frames, pageId);
      await saveFrame({id: frameId, pageId, x: pos.x, y: pos.y});
    },
    [saveFrame]
  );

  const updateFramePosition = useCallback(
    (frameId: string, x: number, y: number, persist = false) => {
      const roundedX = Math.round(x);
      const roundedY = Math.round(y);
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const nextFrames = prev.frames.map((frame) =>
          frame.id === frameId ? {...frame, x: roundedX, y: roundedY} : frame
        );
        if (persist) {
          commitNextSnapshot({
            frames: nextFrames,
            annotations: prev.annotations,
          });
        }
        return {
          ...prev,
          frames: nextFrames,
        };
      });
      if (persist) {
        apiSavePrototypeFrame({
          boardId,
          frame: {id: frameId, x: roundedX, y: roundedY},
        }).catch((err) => {
          console.error('Failed to persist frame position:', err);
        });
      }
    },
    [boardId, commitNextSnapshot]
  );

  const updateFrameCachedHeight = useCallback(
    (frameId: string, height: number) => {
      const rounded = Math.max(120, Math.round(height));
      if (committedSnapshotRef.current) {
        committedSnapshotRef.current = {
          ...committedSnapshotRef.current,
          frames: committedSnapshotRef.current.frames.map((frame) =>
            frame.id === frameId ? {...frame, cachedHeight: rounded} : frame
          ),
        };
      }
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const existing = prev.frames.find((frame) => frame.id === frameId);
        if (!existing || existing.cachedHeight === rounded) {
          return prev;
        }
        return {
          ...prev,
          frames: prev.frames.map((frame) =>
            frame.id === frameId ? {...frame, cachedHeight: rounded} : frame
          ),
        };
      });
    },
    []
  );

  const insertBlockIntoFrame = useCallback(
    async (
      frameId: string,
      block: PrototypeBlock
    ): Promise<{frame: PrototypeFrame; blockKey: string}> => {
      const current = bundleRef.current;
      const frame = current?.frames.find((item) => item.id === frameId);
      if (!frame) {
        throw new Error('Target frame not found.');
      }
      const blockKey = `blk-${autokey(6).toLowerCase()}`;
      const existingOrder = Array.isArray(frame.blocks?._array)
        ? [...frame.blocks._array]
        : [];
      const nextBlocks: PrototypeBlockMap = {
        ...frame.blocks,
        _array: [...existingOrder, blockKey],
        [blockKey]: block,
      };
      const saved = await saveFrame({id: frameId, blocks: nextBlocks});
      return {frame: saved, blockKey};
    },
    [saveFrame]
  );

  const addComment = useCallback(
    async (input: {
      threadId?: string;
      anchor?: PrototypeCommentAnchor;
      anchorLabel?: string;
      body: string;
      content: string;
      mentions?: string[];
    }): Promise<PrototypeCommentThread> => {
      const thread = await apiAddPrototypeComment({boardId, ...input});
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.comments.some((item) => item.id === thread.id);
        return {
          ...prev,
          comments: exists
            ? prev.comments.map((item) =>
                item.id === thread.id ? thread : item
              )
            : [thread, ...prev.comments],
        };
      });
      return thread;
    },
    [boardId]
  );

  const setCommentStatus = useCallback(
    async (
      threadId: string,
      status: 'open' | 'resolved'
    ): Promise<PrototypeCommentThread> => {
      const thread = await apiSetPrototypeCommentStatus({
        boardId,
        threadId,
        status,
      });
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          comments: prev.comments.map((item) =>
            item.id === thread.id ? thread : item
          ),
        };
      });
      return thread;
    },
    [boardId]
  );

  const updateCommentAnchor = useCallback(
    (
      threadId: string,
      anchor: PrototypeCommentAnchor,
      anchorLabel: string,
      persist = true
    ) => {
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          comments: prev.comments.map((thread) =>
            thread.id === threadId ? {...thread, anchor, anchorLabel} : thread
          ),
        };
      });
      if (persist) {
        apiMovePrototypeComment({
          boardId,
          threadId,
          anchor,
          anchorLabel,
        })
          .then((saved) => {
            setBundle((prev) => {
              if (!prev) {
                return prev;
              }
              return {
                ...prev,
                comments: prev.comments.map((thread) =>
                  thread.id === saved.id ? saved : thread
                ),
              };
            });
          })
          .catch((err) => {
            console.error('Failed to persist comment position:', err);
          });
      }
    },
    [boardId]
  );

  const deleteComment = useCallback(
    async (threadId: string, commentId: string) => {
      await apiDeletePrototypeComment({boardId, threadId, commentId});
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const nextComments = prev.comments
          .map((thread) => {
            if (thread.id !== threadId) {
              return thread;
            }
            const remaining = thread.comments.filter(
              (item) => item.id !== commentId
            );
            const hasCommentEntries = remaining.some(
              (item) => item.type === 'comment'
            );
            return hasCommentEntries ? {...thread, comments: remaining} : null;
          })
          .filter(Boolean) as PrototypeCommentThread[];
        return {...prev, comments: nextComments};
      });
    },
    [boardId]
  );

  const upsertAnnotationState = useCallback(
    (annotation: PrototypeAnnotation) => {
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.annotations.some(
          (item) => item.id === annotation.id
        );
        return {
          ...prev,
          annotations: exists
            ? prev.annotations.map((item) =>
                item.id === annotation.id ? annotation : item
              )
            : [...prev.annotations, annotation],
        };
      });
    },
    []
  );

  const applyAnnotationMutated = useCallback(
    (annotation: PrototypeAnnotation) => {
      captureAiTurnCheckpoint();
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.annotations.some(
          (item) => item.id === annotation.id
        );
        const nextAnnotations = exists
          ? prev.annotations.map((item) =>
              item.id === annotation.id ? annotation : item
            )
          : [...prev.annotations, annotation];
        committedSnapshotRef.current = cloneHistorySnapshot({
          frames: prev.frames,
          annotations: nextAnnotations,
        });
        return {
          ...prev,
          annotations: nextAnnotations,
        };
      });
    },
    [captureAiTurnCheckpoint]
  );

  /** Removes an annotation from local state. */
  const removeAnnotation = useCallback((annotationId: string) => {
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            annotations: prev.annotations.filter(
              (item) => item.id !== annotationId
            ),
          }
        : prev
    );
  }, []);

  const createAnnotation = useCallback(
    async (input: {
      id?: string;
      pageId: string;
      kind: PrototypeAnnotationKind;
      text: string;
      x: number;
      y: number;
    }): Promise<PrototypeAnnotation> => {
      const id = input.id || `${input.kind}-${autokey(8).toLowerCase()}`;
      const now = Date.now();
      const email = window.firebase?.user?.email || '';
      const draft: PrototypeAnnotation = {
        id,
        boardId,
        pageId: input.pageId,
        kind: input.kind,
        text: input.text,
        x: Math.round(input.x),
        y: Math.round(input.y),
        createdAt: now,
        createdBy: email,
        updatedAt: now,
        updatedBy: email,
      };
      upsertAnnotationState(draft);
      try {
        const saved = await apiSavePrototypeAnnotation({
          boardId,
          annotation: {
            id,
            pageId: draft.pageId,
            kind: draft.kind,
            text: draft.text,
            x: draft.x,
            y: draft.y,
          },
        });
        // Keep any change made while the save was in flight (e.g. a drag).
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          const nextAnnotations = prev.annotations.map((item) =>
            item.id === id
              ? {...saved, x: item.x, y: item.y, text: item.text}
              : item
          );
          commitNextSnapshot({
            frames: prev.frames,
            annotations: nextAnnotations,
          });
          return {
            ...prev,
            annotations: nextAnnotations,
          };
        });
        return saved;
      } catch (err) {
        removeAnnotation(id);
        throw err;
      }
    },
    [boardId, upsertAnnotationState, removeAnnotation, commitNextSnapshot]
  );

  // The last saved state of each annotation with unsaved local changes.
  const annotationOriginsRef = useRef(new Map<string, PrototypeAnnotation>());

  const updateAnnotation = useCallback(
    async (
      patch: Partial<PrototypeAnnotation> & {id: string},
      options?: {persist?: boolean}
    ): Promise<void> => {
      const id = patch.id;
      const current = bundleRef.current?.annotations.find(
        (item) => item.id === id
      );
      if (!current) {
        return;
      }
      const origins = annotationOriginsRef.current;
      if (!origins.has(id)) {
        origins.set(id, current);
      }
      const change: Partial<PrototypeAnnotation> = {...patch};
      if (typeof change.x === 'number') {
        change.x = Math.round(change.x);
      }
      if (typeof change.y === 'number') {
        change.y = Math.round(change.y);
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              annotations: prev.annotations.map((item) =>
                item.id === id ? {...item, ...change} : item
              ),
            }
          : prev
      );
      if (options?.persist === false) {
        return;
      }
      const origin = origins.get(id) as PrototypeAnnotation;
      try {
        const saved = await apiSavePrototypeAnnotation({
          boardId,
          annotation: {...change, id},
        });
        if (origins.get(id) === origin) {
          origins.delete(id);
        }
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          const nextAnnotations = prev.annotations.map((item) =>
            item.id === id
              ? {
                  ...item,
                  updatedAt: saved.updatedAt,
                  updatedBy: saved.updatedBy,
                }
              : item
          );
          commitNextSnapshot({
            frames: prev.frames,
            annotations: nextAnnotations,
          });
          return {
            ...prev,
            annotations: nextAnnotations,
          };
        });
      } catch (err) {
        // Roll back, unless a newer change has started from this state.
        if (origins.get(id) === origin) {
          origins.delete(id);
          setBundle((prev) =>
            prev
              ? {
                  ...prev,
                  annotations: prev.annotations.map((item) =>
                    item.id === id ? origin : item
                  ),
                }
              : prev
          );
        }
        throw err;
      }
    },
    [boardId, commitNextSnapshot]
  );

  const deleteAnnotations = useCallback(
    async (annotationIds: string[]): Promise<void> => {
      const targetSet = new Set(annotationIds);
      const removed = (bundleRef.current?.annotations || []).filter((item) =>
        targetSet.has(item.id)
      );
      if (removed.length === 0) {
        return;
      }
      for (const item of removed) {
        annotationOriginsRef.current.delete(item.id);
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              annotations: prev.annotations.filter(
                (item) => !targetSet.has(item.id)
              ),
            }
          : prev
      );
      try {
        await Promise.all(
          removed.map((item) =>
            apiDeletePrototypeAnnotation({boardId, annotationId: item.id})
          )
        );
        const latest = bundleRef.current;
        if (latest) {
          commitNextSnapshot({
            frames: latest.frames,
            annotations: latest.annotations,
          });
        }
      } catch (err) {
        for (const item of removed) {
          upsertAnnotationState(item);
        }
        throw err;
      }
    },
    [boardId, upsertAnnotationState, commitNextSnapshot]
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string): Promise<void> => {
      await deleteAnnotations([annotationId]);
    },
    [deleteAnnotations]
  );

  const moveItems = useCallback(
    async (
      moves: {
        frames?: Array<{id: string; x: number; y: number}>;
        annotations?: Array<{id: string; x: number; y: number}>;
      },
      persist = false
    ): Promise<void> => {
      const frameMoves = (moves.frames || []).map((item) => ({
        id: item.id,
        x: Math.round(item.x),
        y: Math.round(item.y),
      }));
      const annotationMoves = (moves.annotations || []).map((item) => ({
        id: item.id,
        x: Math.round(item.x),
        y: Math.round(item.y),
      }));
      if (frameMoves.length === 0 && annotationMoves.length === 0) {
        return;
      }

      const frameMoveMap = new Map(frameMoves.map((m) => [m.id, m]));
      const annotationMoveMap = new Map(annotationMoves.map((m) => [m.id, m]));

      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const nextFrames =
          frameMoveMap.size > 0
            ? prev.frames.map((frame) => {
                const next = frameMoveMap.get(frame.id);
                return next ? {...frame, x: next.x, y: next.y} : frame;
              })
            : prev.frames;
        const nextAnnotations =
          annotationMoveMap.size > 0
            ? prev.annotations.map((annotation) => {
                const next = annotationMoveMap.get(annotation.id);
                return next
                  ? {...annotation, x: next.x, y: next.y}
                  : annotation;
              })
            : prev.annotations;
        if (persist) {
          commitNextSnapshot({
            frames: nextFrames,
            annotations: nextAnnotations,
          });
        }
        return {
          ...prev,
          frames: nextFrames,
          annotations: nextAnnotations,
        };
      });

      if (!persist) {
        return;
      }

      await apiMovePrototypeItems({
        boardId,
        frames: frameMoves,
        annotations: annotationMoves,
      });
    },
    [boardId, commitNextSnapshot]
  );

  const syncSnapshotDiff = useCallback(
    async (
      fromSnapshot: BoardHistorySnapshot,
      toSnapshot: BoardHistorySnapshot
    ): Promise<void> => {
      const fromFrames = new Map(fromSnapshot.frames.map((f) => [f.id, f]));
      const toFrames = new Map(toSnapshot.frames.map((f) => [f.id, f]));
      const fromAnnotations = new Map(
        fromSnapshot.annotations.map((a) => [a.id, a])
      );
      const toAnnotations = new Map(
        toSnapshot.annotations.map((a) => [a.id, a])
      );

      const frameDeletes: string[] = [];
      for (const id of fromFrames.keys()) {
        if (!toFrames.has(id)) {
          frameDeletes.push(id);
        }
      }
      const annotationDeletes: string[] = [];
      for (const id of fromAnnotations.keys()) {
        if (!toAnnotations.has(id)) {
          annotationDeletes.push(id);
        }
      }

      const frameSaves: PrototypeFrame[] = [];
      const frameMoves: Array<{id: string; x: number; y: number}> = [];
      for (const nextFrame of toSnapshot.frames) {
        const prevFrame = fromFrames.get(nextFrame.id);
        if (
          !prevFrame ||
          frameContentSignature(prevFrame) !== frameContentSignature(nextFrame)
        ) {
          frameSaves.push(nextFrame);
        } else if (prevFrame.x !== nextFrame.x || prevFrame.y !== nextFrame.y) {
          frameMoves.push({
            id: nextFrame.id,
            x: nextFrame.x,
            y: nextFrame.y,
          });
        }
      }

      const annotationSaves: PrototypeAnnotation[] = [];
      const annotationMoves: Array<{id: string; x: number; y: number}> = [];
      for (const nextAnn of toSnapshot.annotations) {
        const prevAnn = fromAnnotations.get(nextAnn.id);
        if (
          !prevAnn ||
          annotationContentSignature(prevAnn) !==
            annotationContentSignature(nextAnn)
        ) {
          annotationSaves.push(nextAnn);
        } else if (prevAnn.x !== nextAnn.x || prevAnn.y !== nextAnn.y) {
          annotationMoves.push({
            id: nextAnn.id,
            x: nextAnn.x,
            y: nextAnn.y,
          });
        }
      }

      await Promise.all([
        ...frameDeletes.map((frameId) =>
          apiDeletePrototypeFrame({boardId, frameId})
        ),
        ...annotationDeletes.map((annotationId) =>
          apiDeletePrototypeAnnotation({boardId, annotationId})
        ),
        ...frameSaves.map((frame) => apiSavePrototypeFrame({boardId, frame})),
        ...annotationSaves.map((annotation) =>
          apiSavePrototypeAnnotation({boardId, annotation})
        ),
        frameMoves.length + annotationMoves.length > 0
          ? apiMovePrototypeItems({
              boardId,
              frames: frameMoves,
              annotations: annotationMoves,
            })
          : Promise.resolve(),
      ]);
    },
    [boardId]
  );

  const undo = useCallback(async () => {
    const currentBundle = bundleRef.current;
    if (!currentBundle || undoStackRef.current.length === 0) {
      return;
    }
    const fromSnapshot =
      committedSnapshotRef.current || extractHistorySnapshot(currentBundle);
    const targetSnapshot = undoStackRef.current.pop()!;
    redoStackRef.current.push(cloneHistorySnapshot(fromSnapshot));
    aiTurnCapturedRef.current = false;
    committedSnapshotRef.current = cloneHistorySnapshot(targetSnapshot);
    annotationOriginsRef.current.clear();
    syncHistoryCounts();

    const restored = cloneHistorySnapshot(targetSnapshot);
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            frames: restored.frames,
            annotations: restored.annotations,
          }
        : prev
    );

    await syncSnapshotDiff(fromSnapshot, targetSnapshot);
  }, [syncHistoryCounts, syncSnapshotDiff]);

  const redo = useCallback(async () => {
    const currentBundle = bundleRef.current;
    if (!currentBundle || redoStackRef.current.length === 0) {
      return;
    }
    const fromSnapshot =
      committedSnapshotRef.current || extractHistorySnapshot(currentBundle);
    const targetSnapshot = redoStackRef.current.pop()!;
    undoStackRef.current.push(cloneHistorySnapshot(fromSnapshot));
    aiTurnCapturedRef.current = false;
    committedSnapshotRef.current = cloneHistorySnapshot(targetSnapshot);
    annotationOriginsRef.current.clear();
    syncHistoryCounts();

    const restored = cloneHistorySnapshot(targetSnapshot);
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            frames: restored.frames,
            annotations: restored.annotations,
          }
        : prev
    );

    await syncSnapshotDiff(fromSnapshot, targetSnapshot);
  }, [syncHistoryCounts, syncSnapshotDiff]);

  const applyFrameMutated = useCallback(
    (frame: PrototypeFrame) => {
      captureAiTurnCheckpoint();
      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.frames.some((item) => item.id === frame.id);
        const nextFrames = exists
          ? prev.frames.map((item) => (item.id === frame.id ? frame : item))
          : [...prev.frames, frame];
        committedSnapshotRef.current = cloneHistorySnapshot({
          frames: nextFrames,
          annotations: prev.annotations,
        });
        return {
          ...prev,
          frames: nextFrames,
        };
      });
    },
    [captureAiTurnCheckpoint]
  );

  const applyComponentMutated = useCallback((spec: PrototypeComponentSpec) => {
    setBundle((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        components: {
          ...prev.components,
          [spec.name]: spec,
        },
      };
    });
  }, []);

  const setBoardAiChatId = useCallback((chatId: string) => {
    setBundle((prev) => {
      if (!prev) {
        return prev;
      }
      const board = {...prev.board};
      if (chatId) {
        board.aiChatId = chatId;
      } else {
        delete board.aiChatId;
      }
      return {...prev, board};
    });
  }, []);

  const refreshAfterAiTurn = useCallback(() => {
    reload().catch((err) => {
      console.error('Failed to reload board after AI turn:', err);
    });
  }, [reload]);

  return {
    bundle,
    loading,
    error,
    projectContext,
    reload,
    renameBoard,
    updateBoardStatus,
    addPage,
    renamePage,
    duplicateBoard,
    deleteBoard,
    createFrame,
    saveFrame,
    duplicateFrame,
    deleteFrame,
    moveFrameToPage,
    updateFramePosition,
    updateFrameCachedHeight,
    insertBlockIntoFrame,
    addComment,
    setCommentStatus,
    updateCommentAnchor,
    deleteComment,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    deleteAnnotations,
    moveItems,
    canUndo: historyCounts.undo > 0,
    canRedo: historyCounts.redo > 0,
    undo,
    redo,
    applyFrameMutated,
    applyAnnotationMutated,
    applyComponentMutated,
    refreshAfterAiTurn,
    setBoardAiChatId,
  };
}
