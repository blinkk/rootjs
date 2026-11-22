import {IconFrame, IconRobot} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import type {
  CanvasCamera,
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
  zoomCameraAroundPoint,
} from '../../../../../shared/prototypes.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import type {PrototypeExportPayload} from '../../prototype-export.js';
import {
  type PrototypeCanvasTool,
  PrototypeFrameView,
} from '../PrototypeFrame/PrototypeFrame.js';

/** Base spacing in world px between background dot-grid dots. */
const DOT_GRID_STEP = 24;

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
  /** Active canvas tool (`select`, `pan`, `comment`). */
  tool: PrototypeCanvasTool;
  /** Whether Spacebar temporary-pan is currently held. */
  spacePressed: boolean;
  /** Whether Meta/Ctrl is currently held (morphs Expand into Open in new tab). */
  metaPressed?: boolean;
  /** Currently selected frame id, if any. */
  selectedFrameId: string | null;
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
    metaPressed = false,
    selectedFrameId,
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
  } = props;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({width: 1280, height: 800});
  const [panning, setPanning] = useState(false);
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
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

    // Background click in Select mode clears selection and exits interactive mode.
    onSelect(null, null);
  }

  // Enforce MAX_LIVE_PROTOTYPE_IFRAMES (6): always keep the selected frame
  // live, then fill remaining slots with frames closest to viewport center.
  const liveFrameIds = useMemo(() => {
    if (frames.length <= MAX_LIVE_PROTOTYPE_IFRAMES) {
      return new Set(frames.map((frame) => frame.id));
    }
    const chosen = new Set<string>();
    if (
      selectedFrameId &&
      frames.some((frame) => frame.id === selectedFrameId)
    ) {
      chosen.add(selectedFrameId);
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
    selectedFrameId,
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
        panning || draggingThreadId
          ? 'cursor-grabbing'
          : effectivePanMode
            ? 'cursor-grab'
            : tool === 'comment'
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
        className="PrototypeCanvas__world absolute left-0 top-0"
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
            metaPressed={metaPressed}
            pages={pages}
            isLive={liveFrameIds.has(frame.id)}
            isSelected={selectedFrameId === frame.id}
            selectedBlockKey={
              selectedFrameId === frame.id ? selectedBlockKey : null
            }
            canEdit={canEdit}
            aiAvailable={aiAvailable}
            onSelect={(frameId, blockKey) => onSelect(frameId, blockKey)}
            onExpandFrame={onExpandFrame}
            onOpenPreview={onOpenPreview}
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

        {/* Unified draggable comment bubbles across frames, blocks, and free canvas. */}
        {openThreads.map((thread) => {
          const messageCount =
            thread.comments.filter((item) => item.type === 'comment').length ||
            1;
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
                'PrototypeCanvas__commentPin absolute z-30 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-button-blue-hover font-sans text-xs font-bold text-inverse shadow-md transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
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
              aria-label={`Open comment thread on ${thread.anchorLabel}`}
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
              {messageCount}
            </button>
          );
        })}
      </div>

      {/* Empty or AI-generating skeleton state centered over the canvas when the page has zero frames. */}
      {frames.length === 0 && (
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
