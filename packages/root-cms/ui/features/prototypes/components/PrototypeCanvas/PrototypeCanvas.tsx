import {IconFrame, IconRobot} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import type {
  CanvasCamera,
  PrototypeAnnotation,
  PrototypeAnnotationKind,
  PrototypeBlockRect,
  PrototypeBoardPage,
  PrototypeCommentAnchor,
  PrototypeCommentThread,
  PrototypeFrame,
  PrototypeTheme,
} from '../../../../../shared/prototypes.js';
import {
  getOrderedBlocks,
  MAX_LIVE_PROTOTYPE_IFRAMES,
  PROTOTYPE_LABEL_FONT_SIZE,
  PROTOTYPE_NOTE_WIDTH,
  zoomCameraAroundPoint,
} from '../../../../../shared/prototypes.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {useUserProfiles} from '../../../users/useUserProfile.js';
import type {PrototypeExportPayload} from '../../prototype-export.js';
import {PrototypeAnnotationView} from '../PrototypeAnnotation/PrototypeAnnotation.js';
import {
  type PrototypeCanvasTool,
  PrototypeFrameView,
} from '../PrototypeFrame/PrototypeFrame.js';

/** Base spacing in world px between background dot-grid dots. */
const DOT_GRID_STEP = 24;

/** Screen px the pointer must travel before a press becomes a marquee or drag. */
const DRAG_THRESHOLD_PX = 4;

/** Viewport-relative rectangle rendered during marquee drag selection. */
interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Props for the infinite pan/zoom prototype artboard canvas. */
export interface PrototypeCanvasProps {
  /** Frames belonging to the active page. */
  frames: PrototypeFrame[];
  /** Board theme passed down to frames. */
  theme: PrototypeTheme;
  /** Active page metadata. */
  activePage: PrototypeBoardPage;
  /** All board pages (for frame "Move to page" menus). */
  pages: PrototypeBoardPage[];
  /** Current 2D camera state. */
  camera: CanvasCamera;
  /** Updates camera state (functional updater supported). */
  onChangeCamera: (
    next: CanvasCamera | ((prev: CanvasCamera) => CanvasCamera)
  ) => void;
  /** Notes and text labels on the active page. */
  annotations: PrototypeAnnotation[];
  /** Currently selected annotation id, if any. */
  selectedAnnotationId: string | null;
  /** All selected annotation ids when multi-selection is active. */
  selectedAnnotationIds?: string[];
  /** Id of the annotation whose text is being edited, if any. */
  editingAnnotationId: string | null;
  /** Active canvas tool (`select`, `pan`, `comment`, `note`, `text`). */
  tool: PrototypeCanvasTool;
  /** Whether Spacebar temporary-pan is currently held. */
  spacePressed: boolean;
  /** Currently selected frame id, if any. */
  selectedFrameId: string | null;
  /** All selected frame ids when multi-selection is active. */
  selectedFrameIds?: string[];
  /** Currently selected block key inside `selectedFrameId`, if any. */
  selectedBlockKey: string | null;
  /** Open comment threads on the active page. */
  openThreads: PrototypeCommentThread[];
  /** Active thread id whose pin popover is open, if any. */
  activeThreadId: string | null;
  /** Whether the user can mutate frames. */
  canEdit: boolean;
  /** Lowercased email of the signed-in user (allows viewers to drag their own pins). */
  currentUserEmail?: string;
  /** Whether Root AI is available. */
  aiAvailable: boolean;
  /** Whether Root AI is currently generating or has an initial prompt in flight. */
  aiGenerating?: boolean;
  /** Whether a right-hand floating panel is open (used to center empty/skeleton states). */
  sidePanelOpen?: boolean;
  /** Exposes viewport element measurement callback to the parent page. */
  onViewportElement?: (el: HTMLDivElement | null) => void;
  /** Selection and interaction callbacks. */
  onSelect: (frameId: string | null, blockKey: string | null) => void;
  onExpandFrame: (frameId: string) => void;
  onOpenPreview: (frameId: string) => void;
  onEditFrameWithAi: (frameId: string) => void;
  onDragFramePosition: (
    frameId: string,
    x: number,
    y: number,
    persist: boolean
  ) => void;
  onDropCommentPin: (
    anchor: PrototypeCommentAnchor,
    anchorLabel: string,
    clientX: number,
    clientY: number
  ) => void;
  onSelectCommentThread: (
    thread: PrototypeCommentThread,
    clientX: number,
    clientY: number
  ) => void;
  onMoveComment: (
    threadId: string,
    anchor: PrototypeCommentAnchor,
    anchorLabel: string,
    persist: boolean
  ) => void;
  onStartDragComment?: () => void;
  onFrameLayout: (
    frameId: string,
    height: number,
    blockRects: PrototypeBlockRect[]
  ) => void;
  onRegisterExporter: (
    frameId: string,
    exporter: (() => Promise<PrototypeExportPayload | null>) | null
  ) => void;
  onDuplicateFrame: (frameId: string) => void;
  onResizeFrame: (frameId: string, width: number) => void;
  onMoveFrameToPage: (frameId: string, pageId: string) => void;
  onExportFrame: (frameId: string) => void;
  onDeleteFrame: (frameId: string) => void;
  onNewFrame: () => void;
  onOpenAi: () => void;
  /** Places a new annotation at a world point (Note and Text tools). */
  onCreateAnnotation: (
    kind: PrototypeAnnotationKind,
    worldX: number,
    worldY: number
  ) => void;
  /** Selects an annotation. */
  onSelectAnnotation: (annotationId: string) => void;
  /** Puts an annotation into edit mode. */
  onEditAnnotation: (annotationId: string) => void;
  /** Commits an annotation's edited text (empty text deletes it). */
  onCommitAnnotation: (annotationId: string, text: string) => void;
  /** Leaves edit mode without saving. */
  onCancelAnnotationEdit: (annotationId: string) => void;
  /** Moves an annotation during (`persist` false) or after a drag. */
  onDragAnnotation: (
    annotationId: string,
    x: number,
    y: number,
    persist: boolean
  ) => void;
  /** Updates multi-item selection across frames and annotations. */
  onSelectGroup?: (frameIds: string[], annotationIds: string[]) => void;
  /** Batch-moves multiple frames and/or annotations together. */
  onMoveItems?: (
    moves: {
      frames?: Array<{id: string; x: number; y: number}>;
      annotations?: Array<{id: string; x: number; y: number}>;
    },
    persist: boolean
  ) => void;
  /** Copies a deeplink URL for a frame to the clipboard. */
  onCopyFrameLink?: (frameId: string) => void;
}

/**
 * Infinite dot-grid pan/zoom artboard hosting sandboxed prototype frames,
 * free-floating canvas comments, and the `MAX_LIVE_PROTOTYPE_IFRAMES` budget.
 */
export function PrototypeCanvas(props: PrototypeCanvasProps) {
  const {
    frames,
    theme,
    activePage,
    pages,
    camera,
    onChangeCamera,
    tool,
    spacePressed,
    selectedFrameId,
    selectedFrameIds,
    selectedBlockKey,
    openThreads,
    activeThreadId,
    canEdit,
    currentUserEmail = '',
    aiAvailable,
    aiGenerating = false,
    sidePanelOpen = false,
    onViewportElement,
    onSelect,
    onExpandFrame,
    onOpenPreview,
    onEditFrameWithAi,
    onDragFramePosition,
    onDropCommentPin,
    onSelectCommentThread,
    onMoveComment,
    onStartDragComment,
    onFrameLayout,
    onRegisterExporter,
    onDuplicateFrame,
    onResizeFrame,
    onMoveFrameToPage,
    onExportFrame,
    onDeleteFrame,
    onNewFrame,
    onOpenAi,
    annotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    editingAnnotationId,
    onCreateAnnotation,
    onSelectAnnotation,
    onEditAnnotation,
    onCommitAnnotation,
    onCancelAnnotationEdit,
    onDragAnnotation,
    onSelectGroup,
    onMoveItems,
    onCopyFrameLink,
  } = props;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({width: 1280, height: 800});
  const [panning, setPanning] = useState(false);
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<{
    frames: Set<string>;
    annotations: Set<string>;
  } | null>(null);

  const effectiveSelectedFrameIds = useMemo(
    () => selectedFrameIds ?? (selectedFrameId ? [selectedFrameId] : []),
    [selectedFrameIds, selectedFrameId]
  );
  const effectiveSelectedAnnotationIds = useMemo(
    () =>
      selectedAnnotationIds ??
      (selectedAnnotationId ? [selectedAnnotationId] : []),
    [selectedAnnotationIds, selectedAnnotationId]
  );
  const selectedFrameSet = useMemo(
    () => new Set(effectiveSelectedFrameIds),
    [effectiveSelectedFrameIds]
  );
  const selectedAnnotationSet = useMemo(
    () => new Set(effectiveSelectedAnnotationIds),
    [effectiveSelectedAnnotationIds]
  );
  const totalSelectedCount =
    effectiveSelectedFrameIds.length + effectiveSelectedAnnotationIds.length;
  const [layoutByFrame, setLayoutByFrame] = useState<
    Record<string, {height: number; blockRects: PrototypeBlockRect[]}>
  >({});
  const layoutByFrameRef = useRef(layoutByFrame);
  layoutByFrameRef.current = layoutByFrame;
  const suppressPinClickRef = useRef<string | null>(null);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Measure viewport size and expose the host element to the page.
  useEffect(() => {
    const el = viewportRef.current;
    onViewportElement?.(el);
    if (!el) {
      return;
    }
    const updateSize = () => {
      setViewportSize({
        width: el.clientWidth || 1280,
        height: el.clientHeight || 800,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      onViewportElement?.(null);
    };
  }, [onViewportElement]);

  // Attach non-passive wheel listener for smooth trackpad pan and pinch zoom.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const bounds = el!.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const anchorX = e.clientX - bounds.left;
        const anchorY = e.clientY - bounds.top;
        // Clamp per-event delta so mouse wheels and trackpad pinches both feel smooth.
        const delta = Math.max(-120, Math.min(120, e.deltaY));
        const factor = Math.exp(-delta * 0.004);
        onChangeCamera((prev) =>
          zoomCameraAroundPoint(prev, prev.zoom * factor, anchorX, anchorY)
        );
      } else {
        onChangeCamera((prev) => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    }
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, [onChangeCamera]);

  const effectivePanMode = tool === 'pan' || spacePressed;

  function handleCanvasPointerDown(e: PointerEvent) {
    const isMiddleClick = e.button === 1;
    const shouldPan = isMiddleClick || (e.button === 0 && effectivePanMode);

    if (shouldPan) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialCamera = cameraRef.current;
      setPanning(true);

      const onMove = (moveEvent: PointerEvent) => {
        onChangeCamera({
          ...initialCamera,
          x: initialCamera.x + (moveEvent.clientX - startX),
          y: initialCamera.y + (moveEvent.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setPanning(false);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return;
    }

    if (e.button !== 0) {
      return;
    }

    if (tool === 'comment') {
      const el = viewportRef.current;
      if (!el) {
        return;
      }
      const bounds = el.getBoundingClientRect();
      const worldX = Math.round(
        (e.clientX - bounds.left - cameraRef.current.x) / cameraRef.current.zoom
      );
      const worldY = Math.round(
        (e.clientY - bounds.top - cameraRef.current.y) / cameraRef.current.zoom
      );
      onDropCommentPin(
        {
          pageId: activePage.id,
          frameId: null,
          relX: 0,
          relY: 0,
          fallbackX: worldX,
          fallbackY: worldY,
        },
        `${activePage.name} canvas`,
        e.clientX,
        e.clientY
      );
      return;
    }

    if (tool === 'note' || tool === 'text') {
      const el = viewportRef.current;
      if (!el || !canEdit) {
        return;
      }
      const bounds = el.getBoundingClientRect();
      const {x, y, zoom} = cameraRef.current;
      onCreateAnnotation(
        tool === 'note' ? 'note' : 'label',
        Math.round((e.clientX - bounds.left - x) / zoom),
        Math.round((e.clientY - bounds.top - y) / zoom)
      );
      return;
    }

    // Background drag in Select mode draws a marquee selection box over frames,
    // notes, and text labels; a plain click clears selection.
    const el = viewportRef.current;
    if (!el) {
      onSelect(null, null);
      return;
    }
    const bounds = el.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialZoom = cameraRef.current.zoom;
    const startWorldX =
      (startClientX - bounds.left - cameraRef.current.x) / initialZoom;
    const startWorldY =
      (startClientY - bounds.top - cameraRef.current.y) / initialZoom;

    const baseFrameIds = e.shiftKey ? [...effectiveSelectedFrameIds] : [];
    const baseAnnotationIds = e.shiftKey
      ? [...effectiveSelectedAnnotationIds]
      : [];

    const domAnnotationRects = new Map<string, DOMRect>();
    for (const node of el.querySelectorAll<HTMLElement>(
      '[data-annotation-id]'
    )) {
      const id = node.dataset.annotationId;
      if (id) {
        domAnnotationRects.set(id, node.getBoundingClientRect());
      }
    }

    const frameBoxes = frames.map((frame) => ({
      id: frame.id,
      x: frame.x,
      y: frame.y,
      width: Math.max(1, frame.width),
      height: Math.max(
        240,
        layoutByFrameRef.current[frame.id]?.height || frame.cachedHeight || 760
      ),
    }));

    const annotationBoxes = annotations.map((item) => {
      const domRect = domAnnotationRects.get(item.id);
      if (domRect && domRect.width > 0 && domRect.height > 0) {
        return {
          id: item.id,
          x: item.x,
          y: item.y,
          width: domRect.width / initialZoom,
          height: domRect.height / initialZoom,
        };
      }
      if (item.kind === 'note') {
        return {
          id: item.id,
          x: item.x,
          y: item.y,
          width: item.width || PROTOTYPE_NOTE_WIDTH,
          height: Math.max(
            80,
            Math.ceil(Math.max(1, item.text.length) / 28) * 22 + 24
          ),
        };
      }
      return {
        id: item.id,
        x: item.x,
        y: item.y,
        width: Math.max(
          80,
          Math.max(1, item.text.length) * PROTOTYPE_LABEL_FONT_SIZE * 0.6
        ),
        height: PROTOTYPE_LABEL_FONT_SIZE * 1.25,
      };
    });

    const applyGroup = (nextFrames: string[], nextAnnotations: string[]) => {
      if (onSelectGroup) {
        onSelectGroup(nextFrames, nextAnnotations);
      } else if (nextFrames.length === 1 && nextAnnotations.length === 0) {
        onSelect(nextFrames[0], null);
      } else if (nextAnnotations.length === 1 && nextFrames.length === 0) {
        onSelectAnnotation(nextAnnotations[0]);
      } else if (nextFrames.length === 0 && nextAnnotations.length === 0) {
        onSelect(null, null);
      }
    };

    let moved = false;
    const onMove = (moveEvent: PointerEvent) => {
      const screenDist = Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY
      );
      if (!moved && screenDist < DRAG_THRESHOLD_PX) {
        return;
      }
      moved = true;
      const curLocalX = moveEvent.clientX - bounds.left;
      const curLocalY = moveEvent.clientY - bounds.top;
      const startLocalX = startClientX - bounds.left;
      const startLocalY = startClientY - bounds.top;

      setMarqueeRect({
        left: Math.min(startLocalX, curLocalX),
        top: Math.min(startLocalY, curLocalY),
        width: Math.abs(curLocalX - startLocalX),
        height: Math.abs(curLocalY - startLocalY),
      });

      const curCam = cameraRef.current;
      const curWorldX = (curLocalX - curCam.x) / curCam.zoom;
      const curWorldY = (curLocalY - curCam.y) / curCam.zoom;
      const minX = Math.min(startWorldX, curWorldX);
      const maxX = Math.max(startWorldX, curWorldX);
      const minY = Math.min(startWorldY, curWorldY);
      const maxY = Math.max(startWorldY, curWorldY);

      const hitFrames = frameBoxes
        .filter(
          (b) =>
            b.x < maxX &&
            b.x + b.width > minX &&
            b.y < maxY &&
            b.y + b.height > minY
        )
        .map((b) => b.id);
      const hitAnnotations = annotationBoxes
        .filter(
          (b) =>
            b.x < maxX &&
            b.x + b.width > minX &&
            b.y < maxY &&
            b.y + b.height > minY
        )
        .map((b) => b.id);

      const mergedFrames = Array.from(new Set([...baseFrameIds, ...hitFrames]));
      const mergedAnnotations = Array.from(
        new Set([...baseAnnotationIds, ...hitAnnotations])
      );
      applyGroup(mergedFrames, mergedAnnotations);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setMarqueeRect(null);
      if (!moved && !e.shiftKey) {
        applyGroup([], []);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Enforce MAX_LIVE_PROTOTYPE_IFRAMES (6): always keep selected frames
  // live, then fill remaining slots with frames closest to viewport center.
  const liveFrameIds = useMemo(() => {
    if (frames.length <= MAX_LIVE_PROTOTYPE_IFRAMES) {
      return new Set(frames.map((frame) => frame.id));
    }
    const chosen = new Set<string>();
    for (const selectedId of effectiveSelectedFrameIds) {
      if (chosen.size >= MAX_LIVE_PROTOTYPE_IFRAMES) {
        break;
      }
      if (frames.some((frame) => frame.id === selectedId)) {
        chosen.add(selectedId);
      }
    }

    const viewLeft = -camera.x / camera.zoom;
    const viewTop = -camera.y / camera.zoom;
    const viewRight = viewLeft + viewportSize.width / camera.zoom;
    const viewBottom = viewTop + viewportSize.height / camera.zoom;
    const viewCenterX = (viewLeft + viewRight) / 2;
    const viewCenterY = (viewTop + viewBottom) / 2;

    const candidates = frames
      .filter((frame) => !chosen.has(frame.id))
      .map((frame) => {
        const height = frame.cachedHeight || 760;
        const intersects =
          frame.x < viewRight &&
          frame.x + frame.width > viewLeft &&
          frame.y < viewBottom &&
          frame.y + height > viewTop;
        const centerX = frame.x + frame.width / 2;
        const centerY = frame.y + height / 2;
        const distance = Math.hypot(
          centerX - viewCenterX,
          centerY - viewCenterY
        );
        return {id: frame.id, intersects, distance};
      })
      .sort((a, b) => {
        if (a.intersects !== b.intersects) {
          return a.intersects ? -1 : 1;
        }
        return a.distance - b.distance;
      });

    for (const candidate of candidates) {
      if (chosen.size >= MAX_LIVE_PROTOTYPE_IFRAMES) {
        break;
      }
      chosen.add(candidate.id);
    }
    return chosen;
  }, [
    frames,
    effectiveSelectedFrameIds,
    camera.x,
    camera.y,
    camera.zoom,
    viewportSize.width,
    viewportSize.height,
  ]);

  const framesById = useMemo(() => {
    const map = new Map<string, PrototypeFrame>();
    for (const frame of frames) {
      map.set(frame.id, frame);
    }
    return map;
  }, [frames]);

  const pinAuthorEmails = useMemo(
    () =>
      Array.from(
        new Set(
          openThreads
            .map(
              (thread) =>
                thread.comments.find((item) => item.type === 'comment')
                  ?.createdBy || thread.createdBy
            )
            .filter(Boolean)
        )
      ),
    [openThreads]
  );
  const {profiles: pinAuthorProfiles} = useUserProfiles(pinAuthorEmails);

  /** Computes the canvas world `(worldX, worldY)` coordinates for an open comment thread. */
  function getCommentWorldPosition(thread: PrototypeCommentThread): {
    worldX: number;
    worldY: number;
  } {
    if (thread.anchor.frameId) {
      const frame = framesById.get(thread.anchor.frameId);
      if (frame) {
        const layout = layoutByFrame[frame.id];
        const frameHeight = Math.max(
          240,
          layout?.height || frame.cachedHeight || 760
        );
        if (thread.anchor.blockKey && layout?.blockRects) {
          const rect = layout.blockRects.find(
            (r) => r.blockKey === thread.anchor.blockKey
          );
          if (rect && rect.width > 0 && rect.height > 0) {
            const localX = rect.left + thread.anchor.relX * rect.width;
            const localY = rect.top + thread.anchor.relY * rect.height;
            return {
              worldX: Math.round(frame.x + localX),
              worldY: Math.round(frame.y + localY),
            };
          }
        }
        const localX = Math.min(
          frame.width - 12,
          Math.max(
            12,
            thread.anchor.fallbackX ?? frame.width * thread.anchor.relX
          )
        );
        const localY = Math.min(
          frameHeight - 12,
          Math.max(
            12,
            thread.anchor.fallbackY ?? frameHeight * thread.anchor.relY
          )
        );
        return {
          worldX: Math.round(frame.x + localX),
          worldY: Math.round(frame.y + localY),
        };
      }
    }
    return {
      worldX: Math.round(thread.anchor.fallbackX),
      worldY: Math.round(thread.anchor.fallbackY),
    };
  }

  /** Hit-tests a world `(worldX, worldY)` point against frames and blocks on the active page. */
  function resolveCommentAnchorAtWorldPoint(
    worldX: number,
    worldY: number
  ): {anchor: PrototypeCommentAnchor; anchorLabel: string} {
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      const layout = layoutByFrameRef.current[frame.id];
      const frameHeight = Math.max(
        240,
        layout?.height || frame.cachedHeight || 760
      );
      if (
        worldX >= frame.x &&
        worldX <= frame.x + frame.width &&
        worldY >= frame.y &&
        worldY <= frame.y + frameHeight
      ) {
        const localX = Math.min(
          frame.width - 12,
          Math.max(12, worldX - frame.x)
        );
        const localY = Math.min(
          frameHeight - 12,
          Math.max(12, worldY - frame.y)
        );
        const rects = layout?.blockRects || [];
        const hitRect = rects.find(
          (r) =>
            localX >= r.left &&
            localX <= r.left + r.width &&
            localY >= r.top &&
            localY <= r.top + r.height
        );
        if (hitRect && hitRect.width > 0 && hitRect.height > 0) {
          const ordered = getOrderedBlocks(frame.blocks);
          const hitBlock = ordered.find(
            (item) => item.key === hitRect.blockKey
          )?.block;
          return {
            anchor: {
              pageId: activePage.id,
              frameId: frame.id,
              blockKey: hitRect.blockKey,
              relX: Math.min(
                1,
                Math.max(0, (localX - hitRect.left) / hitRect.width)
              ),
              relY: Math.min(
                1,
                Math.max(0, (localY - hitRect.top) / hitRect.height)
              ),
              fallbackX: Math.round(localX),
              fallbackY: Math.round(localY),
            },
            anchorLabel: hitBlock
              ? `${frame.title} › ${hitBlock.label}`
              : frame.title,
          };
        }
        return {
          anchor: {
            pageId: activePage.id,
            frameId: frame.id,
            relX: Math.min(1, Math.max(0, localX / Math.max(1, frame.width))),
            relY: Math.min(1, Math.max(0, localY / Math.max(1, frameHeight))),
            fallbackX: Math.round(localX),
            fallbackY: Math.round(localY),
          },
          anchorLabel: frame.title,
        };
      }
    }

    return {
      anchor: {
        pageId: activePage.id,
        frameId: null,
        relX: 0,
        relY: 0,
        fallbackX: Math.round(worldX),
        fallbackY: Math.round(worldY),
      },
      anchorLabel: `${activePage.name} canvas`,
    };
  }

  function handlePinPointerDown(
    e: PointerEvent,
    thread: PrototypeCommentThread,
    initialWorldX: number,
    initialWorldY: number,
    canMovePin: boolean
  ) {
    if (e.button !== 0 || effectivePanMode) {
      return;
    }
    e.stopPropagation();
    if (!canMovePin) {
      return;
    }

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let moved = false;
    let latestResolved: {
      anchor: PrototypeCommentAnchor;
      anchorLabel: string;
    } | null = null;

    const onMove = (moveEvent: PointerEvent) => {
      const screenDist = Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY
      );
      if (!moved && screenDist < 4) {
        return;
      }
      if (!moved) {
        moved = true;
        setDraggingThreadId(thread.id);
        suppressPinClickRef.current = thread.id;
        onStartDragComment?.();
      }
      const zoom = cameraRef.current.zoom;
      const nextWorldX =
        initialWorldX + (moveEvent.clientX - startClientX) / zoom;
      const nextWorldY =
        initialWorldY + (moveEvent.clientY - startClientY) / zoom;
      latestResolved = resolveCommentAnchorAtWorldPoint(nextWorldX, nextWorldY);
      onMoveComment(
        thread.id,
        latestResolved.anchor,
        latestResolved.anchorLabel,
        false
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDraggingThreadId(null);
      if (moved && latestResolved) {
        onMoveComment(
          thread.id,
          latestResolved.anchor,
          latestResolved.anchorLabel,
          true
        );
        window.setTimeout(() => {
          if (suppressPinClickRef.current === thread.id) {
            suppressPinClickRef.current = null;
          }
        }, 50);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /**
   * Handles pointer presses on frames and annotations, supporting Shift+click
   * multi-select toggling and synchronized group dragging across selected
   * frames, sticky notes, and text labels.
   */
  function handleItemPointerDown(
    e: PointerEvent,
    target:
      | {
          kind: 'frame';
          id: string;
          part: 'header' | 'body';
          blockKey: string | null;
        }
      | {kind: 'annotation'; id: string}
  ) {
    if (e.button !== 0 || effectivePanMode) {
      return;
    }
    e.stopPropagation();

    let dragFrameIds: string[] = [];
    let dragAnnotationIds: string[] = [];
    let narrowOnClick: (() => void) | null = null;
    let canDrag = false;

    if (e.shiftKey) {
      const nextFrames =
        target.kind === 'frame'
          ? selectedFrameSet.has(target.id)
            ? effectiveSelectedFrameIds.filter((id) => id !== target.id)
            : [...effectiveSelectedFrameIds, target.id]
          : [...effectiveSelectedFrameIds];
      const nextAnnotations =
        target.kind === 'annotation'
          ? selectedAnnotationSet.has(target.id)
            ? effectiveSelectedAnnotationIds.filter((id) => id !== target.id)
            : [...effectiveSelectedAnnotationIds, target.id]
          : [...effectiveSelectedAnnotationIds];
      if (onSelectGroup) {
        onSelectGroup(nextFrames, nextAnnotations);
      }
      const stillSelected =
        target.kind === 'frame'
          ? nextFrames.includes(target.id)
          : nextAnnotations.includes(target.id);
      if (!stillSelected || !canEdit) {
        return;
      }
      dragFrameIds = nextFrames;
      dragAnnotationIds = nextAnnotations;
      canDrag =
        target.kind === 'annotation' ||
        target.part === 'header' ||
        nextFrames.length + nextAnnotations.length > 1;
    } else {
      const wasSelected =
        target.kind === 'frame'
          ? selectedFrameSet.has(target.id)
          : selectedAnnotationSet.has(target.id);

      if (wasSelected && totalSelectedCount > 1) {
        dragFrameIds = [...effectiveSelectedFrameIds];
        dragAnnotationIds = [...effectiveSelectedAnnotationIds];
        canDrag = canEdit;
        narrowOnClick = () => {
          if (target.kind === 'frame') {
            onSelect(
              target.id,
              target.part === 'body' ? target.blockKey : null
            );
          } else {
            onSelectAnnotation(target.id);
          }
        };
      } else if (target.kind === 'frame') {
        onSelect(target.id, target.part === 'body' ? target.blockKey : null);
        dragFrameIds = [target.id];
        canDrag = canEdit && target.part === 'header';
      } else {
        onSelectAnnotation(target.id);
        dragAnnotationIds = [target.id];
        canDrag = canEdit;
      }
    }

    if (!canDrag && !narrowOnClick) {
      return;
    }

    const frameOrigins = dragFrameIds
      .map((id) => framesById.get(id))
      .filter((f): f is PrototypeFrame => Boolean(f))
      .map((f) => ({id: f.id, x: f.x, y: f.y}));
    const annotationById = new Map(annotations.map((a) => [a.id, a]));
    const annotationOrigins = dragAnnotationIds
      .map((id) => annotationById.get(id))
      .filter((a): a is PrototypeAnnotation => Boolean(a))
      .map((a) => ({id: a.id, x: a.x, y: a.y}));

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let moved = false;

    const applyDelta = (dx: number, dy: number, persist: boolean) => {
      const nextFrameMoves = frameOrigins.map((o) => ({
        id: o.id,
        x: o.x + dx,
        y: o.y + dy,
      }));
      const nextAnnotationMoves = annotationOrigins.map((o) => ({
        id: o.id,
        x: o.x + dx,
        y: o.y + dy,
      }));
      if (
        onMoveItems &&
        nextFrameMoves.length + nextAnnotationMoves.length > 1
      ) {
        onMoveItems(
          {frames: nextFrameMoves, annotations: nextAnnotationMoves},
          persist
        );
        return;
      }
      for (const fm of nextFrameMoves) {
        onDragFramePosition(fm.id, fm.x, fm.y, persist);
      }
      for (const am of nextAnnotationMoves) {
        onDragAnnotation(am.id, am.x, am.y, persist);
      }
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!canDrag) {
        return;
      }
      const screenDist = Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY
      );
      if (!moved && screenDist < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!moved) {
        moved = true;
        setDraggingGroup({
          frames: new Set(frameOrigins.map((f) => f.id)),
          annotations: new Set(annotationOrigins.map((a) => a.id)),
        });
      }
      const zoom = cameraRef.current.zoom;
      applyDelta(
        (moveEvent.clientX - startClientX) / zoom,
        (moveEvent.clientY - startClientY) / zoom,
        false
      );
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDraggingGroup(null);
      if (moved) {
        if (upEvent.type === 'pointercancel') {
          applyDelta(0, 0, false);
        } else {
          const zoom = cameraRef.current.zoom;
          applyDelta(
            (upEvent.clientX - startClientX) / zoom,
            (upEvent.clientY - startClientY) / zoom,
            true
          );
        }
      } else if (narrowOnClick) {
        narrowOnClick();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Scale dot-grid spacing cleanly so dots stay legible when zoomed far out.
  const gridStep = Math.max(12, DOT_GRID_STEP * camera.zoom);
  const hudScale = Math.min(
    2.2,
    Math.max(0.85, 1 / Math.max(camera.zoom, 0.2))
  );

  return (
    <div
      ref={viewportRef}
      className={cn(
        'PrototypeCanvas relative size-full overflow-hidden select-none bg-page',
        panning || draggingThreadId || draggingGroup
          ? 'cursor-grabbing'
          : effectivePanMode
            ? 'cursor-grab'
            : tool === 'comment' || tool === 'note' || tool === 'text'
              ? 'cursor-crosshair'
              : 'cursor-default'
      )}
      style={{
        backgroundSize: `${gridStep}px ${gridStep}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerDown={handleCanvasPointerDown}
    >
      {/* World-space infinite transform layer. */}
      <div
        className={cn(
          'PrototypeCanvas__world absolute left-0 top-0',
          marqueeRect && 'pointer-events-none'
        )}
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {frames.map((frame) => (
          <PrototypeFrameView
            key={frame.id}
            frame={frame}
            theme={theme}
            zoom={camera.zoom}
            tool={effectivePanMode ? 'pan' : tool}
            pages={pages}
            isLive={liveFrameIds.has(frame.id)}
            isSelected={selectedFrameSet.has(frame.id)}
            isMultiSelected={
              selectedFrameSet.has(frame.id) && totalSelectedCount > 1
            }
            isDraggingGroup={Boolean(draggingGroup?.frames.has(frame.id))}
            selectedBlockKey={
              totalSelectedCount === 1 && selectedFrameId === frame.id
                ? selectedBlockKey
                : null
            }
            canEdit={canEdit}
            aiAvailable={aiAvailable}
            onSelect={(frameId, blockKey) => onSelect(frameId, blockKey)}
            onFramePointerDown={(e, part, blockKey) =>
              handleItemPointerDown(e, {
                kind: 'frame',
                id: frame.id,
                part,
                blockKey,
              })
            }
            onExpandFrame={onExpandFrame}
            onOpenPreview={onOpenPreview}
            onCopyFrameLink={onCopyFrameLink}
            onEditFrameWithAi={onEditFrameWithAi}
            onDragPosition={onDragFramePosition}
            onDropCommentPin={onDropCommentPin}
            onLayout={(frameId, height, blockRects) => {
              setLayoutByFrame((prev) => ({
                ...prev,
                [frameId]: {height, blockRects},
              }));
              onFrameLayout(frameId, height, blockRects);
            }}
            onRegisterExporter={onRegisterExporter}
            onDuplicateFrame={onDuplicateFrame}
            onResizeFrame={onResizeFrame}
            onMoveFrameToPage={onMoveFrameToPage}
            onExportFrame={onExportFrame}
            onDeleteFrame={onDeleteFrame}
          />
        ))}

        {/* Notes and text labels, above frames and below comment pins. */}
        {annotations.map((annotation) => (
          <PrototypeAnnotationView
            key={annotation.id}
            annotation={annotation}
            zoom={camera.zoom}
            isSelected={selectedAnnotationSet.has(annotation.id)}
            isEditing={editingAnnotationId === annotation.id}
            isDraggingGroup={Boolean(
              draggingGroup?.annotations.has(annotation.id)
            )}
            interactive={canEdit && !effectivePanMode && tool !== 'comment'}
            onSelect={() => onSelectAnnotation(annotation.id)}
            onAnnotationPointerDown={(e) =>
              handleItemPointerDown(e, {kind: 'annotation', id: annotation.id})
            }
            onStartEdit={() => onEditAnnotation(annotation.id)}
            onCommit={(text) => onCommitAnnotation(annotation.id, text)}
            onCancel={() => onCancelAnnotationEdit(annotation.id)}
            onDrag={(x, y, persist) =>
              onDragAnnotation(annotation.id, x, y, persist)
            }
          />
        ))}

        {/* Unified draggable comment bubbles across frames, blocks, and free canvas. */}
        {openThreads.map((thread) => {
          const authorEmail =
            thread.comments.find((item) => item.type === 'comment')
              ?.createdBy || thread.createdBy;
          const authorProfile = authorEmail
            ? pinAuthorProfiles.get(authorEmail.toLowerCase()) || null
            : null;
          const isActivePin = thread.id === activeThreadId;
          const isDraggingPin = thread.id === draggingThreadId;
          const canMovePin =
            canEdit ||
            Boolean(
              currentUserEmail &&
              thread.createdBy.toLowerCase() === currentUserEmail
            );
          const {worldX, worldY} = getCommentWorldPosition(thread);
          return (
            <button
              key={thread.id}
              type="button"
              className={cn(
                'PrototypeCanvas__commentPin absolute z-30 flex size-8 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface p-0 shadow-md transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                isDraggingPin
                  ? 'scale-110 cursor-grabbing ring-2 ring-focus'
                  : canMovePin && !effectivePanMode
                    ? 'cursor-grab hover:scale-110'
                    : 'cursor-pointer hover:scale-110',
                isActivePin && 'ring-2 ring-focus'
              )}
              style={{
                left: `${worldX}px`,
                top: `${worldY}px`,
                transform: `translate(-50%, -50%) scale(${hudScale})`,
              }}
              aria-label={`Open comment by ${authorProfile?.displayName || authorEmail}`}
              onPointerDown={(e) =>
                handlePinPointerDown(e, thread, worldX, worldY, canMovePin)
              }
              onClick={(e) => {
                e.stopPropagation();
                if (suppressPinClickRef.current === thread.id) {
                  suppressPinClickRef.current = null;
                  return;
                }
                if (thread.anchor.frameId) {
                  onSelect(
                    thread.anchor.frameId,
                    thread.anchor.blockKey || null
                  );
                }
                onSelectCommentThread(thread, e.clientX, e.clientY);
              }}
            >
              <UserAvatar
                email={authorEmail}
                profile={authorProfile}
                size={28}
                withTooltip={false}
                className="pointer-events-none"
              />
            </button>
          );
        })}
      </div>

      {/* Marquee rubber-band selection rectangle in viewport screen space. */}
      {marqueeRect && (
        <div
          className="PrototypeCanvas__marquee pointer-events-none absolute z-40 rounded-sm border border-focus bg-info-soft/25"
          style={{
            left: `${marqueeRect.left}px`,
            top: `${marqueeRect.top}px`,
            width: `${marqueeRect.width}px`,
            height: `${marqueeRect.height}px`,
          }}
        />
      )}

      {/* Empty or AI-generating skeleton state centered over the canvas when the page has zero frames. */}
      {frames.length === 0 && annotations.length === 0 && (
        <div
          className={cn(
            'PrototypeCanvas__empty pointer-events-none absolute inset-0 flex items-center justify-center p-4 pt-16 pb-16 transition-[padding]',
            sidePanelOpen && 'lg:pr-98'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {aiGenerating ? (
            <div
              role="status"
              aria-live="polite"
              className="PrototypeCanvas__skeleton pointer-events-auto flex w-full max-w-xl flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-strong">
                  <Spinner size="sm" label={null} />
                  <span>Building artboard with Root AI…</span>
                </div>
              </div>

              <div className="flex flex-col gap-5 overflow-hidden rounded-lg border border-border bg-surface p-6 shadow-md">
                <div className="flex items-center gap-2.5 rounded-md border border-info-line bg-info-soft/60 px-3.5 py-2.5 text-left">
                  <IconRobot
                    size={18}
                    className="shrink-0 text-info"
                    aria-hidden="true"
                  />
                  <p className="m-0 text-sm text-fg">
                    Root AI is sketching your layout — your artboard will show
                    up here shortly.
                  </p>
                </div>

                {/* Skeleton hero block. */}
                <div className="flex animate-pulse flex-col items-center gap-2.5 rounded-md border border-border bg-surface-subtle px-6 py-8">
                  <div className="h-2.5 w-24 rounded-full bg-surface-active" />
                  <div className="h-5 w-3/4 rounded-md bg-border-strong/60" />
                  <div className="h-3 w-1/2 rounded-md bg-surface-active" />
                  <div className="mt-2 h-7 w-28 rounded-md bg-border-strong/50" />
                </div>

                {/* Skeleton 3-column feature/content grid. */}
                <div className="grid animate-pulse grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-4"
                    >
                      <div className="h-3 w-1/2 rounded-sm bg-border-strong/50" />
                      <div className="h-2.5 w-full rounded-sm bg-surface-active" />
                      <div className="h-2.5 w-4/5 rounded-sm bg-surface-active" />
                    </div>
                  ))}
                </div>

                {/* Skeleton footer CTA band. */}
                <div className="flex animate-pulse flex-col items-center gap-2 rounded-md bg-surface-active/80 px-6 py-5">
                  <div className="h-3.5 w-2/5 rounded-sm bg-border-strong/60" />
                  <div className="h-6 w-24 rounded-sm bg-border-strong/50" />
                </div>
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center shadow-md">
              <div className="flex size-10 items-center justify-center rounded-full bg-surface-hover text-muted">
                <IconFrame size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-base font-semibold text-strong">
                  No frames on {activePage.name}
                </h2>
                <p className="m-0 text-sm text-muted">
                  Create a blank artboard frame or ask Root AI to generate
                  layout explorations.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {canEdit && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<IconFrame />}
                    onClick={onNewFrame}
                  >
                    New frame
                  </Button>
                )}
                {aiAvailable && (
                  <Button
                    variant="default"
                    size="sm"
                    icon={<IconRobot />}
                    onClick={onOpenAi}
                  >
                    Edit with AI
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
