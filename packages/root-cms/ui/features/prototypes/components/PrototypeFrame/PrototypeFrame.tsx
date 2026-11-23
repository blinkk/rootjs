import {
  IconArrowsDiagonal,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDotsVertical,
  IconExternalLink,
  IconFolderSymlink,
  IconPhoto,
  IconRobot,
  IconTrash,
} from '@tabler/icons-preact';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import type {
  PrototypeBlockRect,
  PrototypeBoardPage,
  PrototypeCommentAnchor,
  PrototypeFrame,
  PrototypeTheme,
} from '../../../../../shared/prototypes.js';
import {
  buildPrototypeImgSrc,
  DEFAULT_FOLD_HEIGHT_DESKTOP,
  DEFAULT_FOLD_HEIGHT_MOBILE,
  getOrderedBlocks,
} from '../../../../../shared/prototypes.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  Menu,
  MenuDivider,
  MenuGroup,
  MenuItem,
} from '../../../../primitives/Menu/Menu.js';
import {cn} from '../../../../utils/classes.js';
import {
  buildFrameRenderContent,
  buildPrototypeThemeCss,
  type PrototypeExportPayload,
} from '../../prototype-export.js';

/** Canvas interaction tool modes. */
export type PrototypeCanvasTool = 'select' | 'pan' | 'comment';

/** Preset responsive widths offered in a frame's quick actions menu. */
const FRAME_WIDTH_PRESETS = [
  {width: 1440, label: 'Desktop (1440px)', icon: <IconDeviceDesktop />},
  {width: 768, label: 'Tablet (768px)', icon: <IconDeviceTablet />},
  {width: 390, label: 'Mobile (390px)', icon: <IconDeviceMobile />},
];

/** Default height before an iframe reports its measured content height. */
const FALLBACK_FRAME_HEIGHT = 760;

/** Upper bound on a frame's auto-measured height, in CSS px. */
const MAX_FRAME_HEIGHT = 20000;

/** Timeout in ms when awaiting an export payload from a sandboxed iframe. */
const EXPORT_PAYLOAD_TIMEOUT_MS = 2500;

/** Escapes plain text for safe insertion inside an HTML `<title>` element. */
function escapeHtmlTitle(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the sandboxed `<iframe sandbox="allow-scripts" srcdoc>` document
 * shell with a strict CSP that allows only the CMS prototype runtime script
 * and optional Google Fonts stylesheets.
 */
function buildSandboxedFrameSrcdoc(options: {
  cmsOrigin: string;
  fontUrls?: string[];
  initialTitle?: string;
}): string {
  const runtimeUrl = `${options.cmsOrigin}/cms/static/prototype-runtime.js`;
  const csp = [
    "default-src 'none'",
    `script-src ${runtimeUrl}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    buildPrototypeImgSrc(window.__ROOT_CTX.firebaseConfig?.storageBucket),
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');

  const fontLinks = (options.fontUrls || [])
    .filter((url) => /^https:\/\/fonts\.googleapis\.com\//.test(url))
    .map(
      (url) => `<link rel="stylesheet" href="${url.replace(/"/g, '&quot;')}" />`
    )
    .join('\n    ');
  const safeTitle = escapeHtmlTitle(
    (options.initialTitle || '').trim() || 'Prototype Frame'
  );

  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${safeTitle}</title>`,
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    fontLinks ? `    ${fontLinks}` : '',
    '    <style>html,body{margin:0;padding:0;min-height:100%;}#proto-root{min-height:100px;}</style>',
    '  </head>',
    '  <body>',
    '    <main id="proto-root"></main>',
    `    <script type="module" src="${runtimeUrl}"></script>`,
    '  </body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Props for a single artboard frame rendered on the prototype canvas. */
export interface PrototypeFrameProps {
  /** Frame data model. */
  frame: PrototypeFrame;
  /** Board theme applied inside the frame. */
  theme: PrototypeTheme;
  /** Current canvas zoom level (used for inverse-scaled crisp HUD chrome). */
  zoom: number;
  /** Current active canvas tool. */
  tool: PrototypeCanvasTool;
  /** All board pages (for the "Move to page…" submenu). */
  pages: PrototypeBoardPage[];
  /** Whether this frame is within the live iframe budget. */
  isLive: boolean;
  /** Whether this frame is currently selected. */
  isSelected: boolean;
  /** Selected block key inside this frame, if any. */
  selectedBlockKey: string | null;
  /** Whether the user can edit/mutate frames. */
  canEdit: boolean;
  /** Whether Root AI is enabled for the project. */
  aiAvailable: boolean;
  /** Called when the user selects the frame or a specific block inside it. */
  onSelect: (frameId: string, blockKey: string | null) => void;
  /** Expands the rendered frame into a full-screen preview overlay. */
  onExpandFrame: (frameId: string) => void;
  /** Opens the rendered frame full-page in a new browser tab. */
  onOpenPreview: (frameId: string) => void;
  /** Selects this frame and opens the Root AI editing panel. */
  onEditFrameWithAi: (frameId: string) => void;
  /** Called when the user drags the frame header to reposition it. */
  onDragPosition: (
    frameId: string,
    x: number,
    y: number,
    persist: boolean
  ) => void;
  /** Called when the user clicks in Comment mode to drop a new pin on this frame. */
  onDropCommentPin: (
    anchor: PrototypeCommentAnchor,
    anchorLabel: string,
    clientX: number,
    clientY: number
  ) => void;
  /** Called when the iframe reports measured layout height and block rects. */
  onLayout: (
    frameId: string,
    height: number,
    blockRects: PrototypeBlockRect[]
  ) => void;
  /** Registers an export requester for this frame's mounted iframe. */
  onRegisterExporter: (
    frameId: string,
    exporter: (() => Promise<PrototypeExportPayload | null>) | null
  ) => void;
  /** Frame action callbacks. */
  onDuplicateFrame: (frameId: string) => void;
  onResizeFrame: (frameId: string, width: number) => void;
  onMoveFrameToPage: (frameId: string, pageId: string) => void;
  onExportFrame: (frameId: string) => void;
  onDeleteFrame: (frameId: string) => void;
}

/**
 * Renders one isolated prototype artboard frame on the infinite canvas,
 * including its sandboxed iframe, transparent pointer shield, screen-space
 * frame header, block selection outline/pill, and open comment pin badges.
 */
export function PrototypeFrameView(props: PrototypeFrameProps) {
  const {
    frame,
    theme,
    zoom,
    tool,
    pages,
    isLive,
    isSelected,
    selectedBlockKey,
    canEdit,
    aiAvailable,
    onSelect,
    onExpandFrame,
    onOpenPreview,
    onEditFrameWithAi,
    onDragPosition,
    onDropCommentPin,
    onLayout,
    onRegisterExporter,
    onDuplicateFrame,
    onResizeFrame,
    onMoveFrameToPage,
    onExportFrame,
    onDeleteFrame,
  } = props;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingExportsRef = useRef(
    new Map<string, (payload: PrototypeExportPayload | null) => void>()
  );
  const [measuredHeight, setMeasuredHeight] = useState(
    frame.cachedHeight || FALLBACK_FRAME_HEIGHT
  );
  // Read through refs by the message bridge so a height change does not tear
  // the bridge down (which would cancel in-flight export requests).
  const measuredHeightRef = useRef(measuredHeight);
  measuredHeightRef.current = measuredHeight;
  const frameWidthRef = useRef(frame.width);
  frameWidthRef.current = frame.width;
  const [blockRects, setBlockRects] = useState<PrototypeBlockRect[]>([]);
  const [hoveredBlockKey, setHoveredBlockKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [titleNaturalWidth, setTitleNaturalWidth] = useState(0);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (el) {
      setTitleNaturalWidth(el.scrollWidth);
    }
  }, [frame.title]);

  const orderedBlocks = useMemo(
    () => getOrderedBlocks(frame.blocks),
    [frame.blocks]
  );

  const blockMap = useMemo(() => {
    const map = new Map<string, (typeof orderedBlocks)[number]['block']>();
    for (const item of orderedBlocks) {
      map.set(item.key, item.block);
    }
    return map;
  }, [orderedBlocks]);

  const blockRectMap = useMemo(() => {
    const map = new Map<string, PrototypeBlockRect>();
    for (const rect of blockRects) {
      map.set(rect.blockKey, rect);
    }
    return map;
  }, [blockRects]);

  const fontUrlsKey = (theme.fontUrls || []).join('|');
  const srcdoc = useMemo(() => {
    const cmsOrigin =
      typeof window !== 'undefined' ? window.location.origin : '';
    return buildSandboxedFrameSrcdoc({
      cmsOrigin,
      fontUrls: theme.fontUrls,
      initialTitle: frame.title,
    });
  }, [fontUrlsKey]);

  const themeCss = useMemo(() => buildPrototypeThemeCss(theme), [theme]);
  const renderContent = useMemo(
    () => buildFrameRenderContent(frame),
    [frame.blocks]
  );
  const foldHeight =
    frame.width <= 480
      ? DEFAULT_FOLD_HEIGHT_MOBILE
      : DEFAULT_FOLD_HEIGHT_DESKTOP;

  const latestRenderRef = useRef({
    frameId: frame.id,
    title: frame.title,
    html: renderContent.html,
    themeCss,
    blockCss: renderContent.blockCss,
    foldHeight,
  });
  latestRenderRef.current = {
    frameId: frame.id,
    title: frame.title,
    html: renderContent.html,
    themeCss,
    blockCss: renderContent.blockCss,
    foldHeight,
  };

  function postRenderToIframe() {
    const win = iframeRef.current?.contentWindow;
    if (!win || !readyRef.current) {
      return;
    }
    const payload = latestRenderRef.current;
    win.postMessage(
      {
        type: 'proto:render',
        frameId: payload.frameId,
        title: payload.title,
        html: payload.html,
        themeCss: payload.themeCss,
        blockCss: payload.blockCss,
        foldHeight: payload.foldHeight,
      },
      '*'
    );
  }

  // Listen for handshake, layout, click, and export replies from this iframe.
  useEffect(() => {
    if (!isLive) {
      readyRef.current = false;
      onRegisterExporter(frame.id, null);
      return;
    }

    function onMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }
      const data = event.data as Record<string, any> | null;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'proto:ready') {
        readyRef.current = true;
        postRenderToIframe();
        return;
      }
      if (data.type === 'proto:layout' && data.frameId === frame.id) {
        const nextHeight = Math.min(
          MAX_FRAME_HEIGHT,
          Math.max(
            200,
            Math.round(Number(data.height) || FALLBACK_FRAME_HEIGHT)
          )
        );
        // Ignore repeat reports so a frame stuck at the cap cannot re-render
        // the board on every animation frame.
        if (
          nextHeight === measuredHeightRef.current &&
          nextHeight === MAX_FRAME_HEIGHT
        ) {
          return;
        }
        const rects = Array.isArray(data.blockRects)
          ? (data.blockRects as PrototypeBlockRect[])
          : [];
        setMeasuredHeight(nextHeight);
        setBlockRects(rects);
        onLayout(frame.id, nextHeight, rects);
        return;
      }
      if (
        data.type === 'proto:block-click' &&
        data.frameId === frame.id &&
        typeof data.blockKey === 'string'
      ) {
        onSelect(frame.id, data.blockKey);
        return;
      }
      if (
        data.type === 'proto:export-payload' &&
        data.frameId === frame.id &&
        typeof data.requestId === 'string'
      ) {
        const resolver = pendingExportsRef.current.get(data.requestId);
        if (resolver) {
          pendingExportsRef.current.delete(data.requestId);
          resolver({
            frameId: frame.id,
            html: String(data.html || ''),
            compiledCss: String(data.compiledCss || ''),
            width: Number(data.width) || frameWidthRef.current,
            height: Number(data.height) || measuredHeightRef.current,
          });
        }
      }
    }

    window.addEventListener('message', onMessage);
    onRegisterExporter(frame.id, () => {
      const win = iframeRef.current?.contentWindow;
      if (!win || !readyRef.current) {
        return Promise.resolve(null);
      }
      const requestId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          pendingExportsRef.current.delete(requestId);
          resolve(null);
        }, EXPORT_PAYLOAD_TIMEOUT_MS);
        pendingExportsRef.current.set(requestId, (payload) => {
          window.clearTimeout(timer);
          resolve(payload);
        });
        win.postMessage(
          {type: 'proto:request-export', frameId: frame.id, requestId},
          '*'
        );
      });
    });

    return () => {
      window.removeEventListener('message', onMessage);
      onRegisterExporter(frame.id, null);
      for (const resolve of pendingExportsRef.current.values()) {
        resolve(null);
      }
      pendingExportsRef.current.clear();
    };
  }, [frame.id, isLive]);

  // Reset ready state if srcdoc changes (e.g. Google Fonts added).
  useEffect(() => {
    readyRef.current = false;
  }, [srcdoc]);

  // Push updated blocks/theme into the live iframe whenever they change.
  useEffect(() => {
    if (isLive && readyRef.current) {
      postRenderToIframe();
    }
  }, [
    isLive,
    frame.title,
    renderContent.html,
    renderContent.blockCss,
    themeCss,
    foldHeight,
  ]);

  /** Hit-tests a frame-local `(x, y)` coordinate against measured block rects. */
  function findBlockAtPoint(
    localX: number,
    localY: number
  ): PrototypeBlockRect | null {
    for (const rect of blockRects) {
      if (
        localX >= rect.left &&
        localX <= rect.left + rect.width &&
        localY >= rect.top &&
        localY <= rect.top + rect.height
      ) {
        return rect;
      }
    }
    return null;
  }

  /** Converts a pointer event over the frame shield into unscaled frame-local px. */
  function getLocalFrameCoords(e: PointerEvent | MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const bounds = el.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? frame.width / bounds.width : 1 / zoom;
    const scaleY = bounds.height > 0 ? displayHeight / bounds.height : 1 / zoom;
    return {
      x: (e.clientX - bounds.left) * scaleX,
      y: (e.clientY - bounds.top) * scaleY,
    };
  }

  function handleHeaderPointerDown(e: PointerEvent) {
    if (e.button !== 0 || tool === 'pan') {
      return;
    }
    // Let clicks on buttons or links inside the header act normally.
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) {
      return;
    }
    e.stopPropagation();
    onSelect(frame.id, null);
    if (!canEdit) {
      return;
    }
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = frame.x;
    const startY = frame.y;
    let moved = false;
    setDragging(true);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      if (!moved && Math.hypot(dx, dy) < 2) {
        return;
      }
      moved = true;
      onDragPosition(frame.id, startX + dx, startY + dy, false);
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragging(false);
      if (moved) {
        const dx = (upEvent.clientX - startClientX) / zoom;
        const dy = (upEvent.clientY - startClientY) / zoom;
        onDragPosition(frame.id, startX + dx, startY + dy, true);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function handleShieldPointerMove(e: PointerEvent) {
    if (tool === 'pan') {
      if (hoveredBlockKey) {
        setHoveredBlockKey(null);
      }
      return;
    }
    const local = getLocalFrameCoords(e);
    const hit = findBlockAtPoint(local.x, local.y);
    setHoveredBlockKey(hit ? hit.blockKey : null);
  }

  function handleShieldPointerDown(e: PointerEvent) {
    if (e.button !== 0 || tool === 'pan') {
      return;
    }
    e.stopPropagation();
    const local = getLocalFrameCoords(e);
    const hit = findBlockAtPoint(local.x, local.y);

    if (tool === 'comment') {
      const hitBlock = hit ? blockMap.get(hit.blockKey) : null;
      const relX =
        hit && hit.width > 0
          ? Math.min(1, Math.max(0, (local.x - hit.left) / hit.width))
          : Math.min(1, Math.max(0, local.x / Math.max(1, frame.width)));
      const relY =
        hit && hit.height > 0
          ? Math.min(1, Math.max(0, (local.y - hit.top) / hit.height))
          : Math.min(1, Math.max(0, local.y / Math.max(1, displayHeight)));
      const anchor: PrototypeCommentAnchor = {
        pageId: frame.pageId,
        frameId: frame.id,
        blockKey: hit?.blockKey,
        relX,
        relY,
        fallbackX: Math.round(local.x),
        fallbackY: Math.round(local.y),
      };
      const anchorLabel = hitBlock
        ? `${frame.title} › ${hitBlock.label}`
        : frame.title;
      onSelect(frame.id, hit?.blockKey || null);
      onDropCommentPin(anchor, anchorLabel, e.clientX, e.clientY);
      return;
    }

    onSelect(frame.id, hit ? hit.blockKey : null);
  }

  const displayHeight = Math.max(
    240,
    isLive ? measuredHeight : frame.cachedHeight || FALLBACK_FRAME_HEIGHT
  );

  // Inverse scale keeps frame headers, pills, and pin badges crisp and legible
  // across zoom levels without growing huge when zoomed far in.
  const hudScale = Math.min(2.2, Math.max(0.85, 1 / Math.max(zoom, 0.2)));
  const selectedBlockRect = selectedBlockKey
    ? blockRectMap.get(selectedBlockKey) || null
    : null;
  const selectedBlock = selectedBlockKey
    ? blockMap.get(selectedBlockKey) || null
    : null;
  const hoveredBlockRect =
    hoveredBlockKey && hoveredBlockKey !== selectedBlockKey
      ? blockRectMap.get(hoveredBlockKey) || null
      : null;

  const otherPages = pages.filter((page) => page.id !== frame.pageId);

  // Right-justify header actions to the right edge of the frame when the frame
  // has enough horizontal width in header space; fall back to compact inline
  // layout when narrower than title + actions.
  const frameHeaderSpaceWidth = Math.round(frame.width / hudScale);
  const estimatedTitleWidth = titleNaturalWidth || frame.title.length * 7.5;
  const neededHeaderWidth = Math.min(estimatedTitleWidth, 280) + 64;
  const rightJustifyActions = frameHeaderSpaceWidth >= neededHeaderWidth;

  return (
    <div
      className={cn(
        'PrototypeFrame absolute select-none',
        isSelected && 'PrototypeFrame--selected'
      )}
      style={{
        left: `${frame.x}px`,
        top: `${frame.y}px`,
        width: `${frame.width}px`,
      }}
      data-frame-id={frame.id}
    >
      {/* Screen-space scaled frame header above the artboard. */}
      <div
        className={cn(
          'PrototypeFrame__header absolute bottom-full left-0 mb-2 flex items-center gap-1.5 pb-1',
          rightJustifyActions ? 'justify-between' : 'w-max',
          canEdit && tool !== 'pan' && 'cursor-grab',
          dragging && 'cursor-grabbing'
        )}
        style={{
          transform: `scale(${hudScale})`,
          transformOrigin: '0 100%',
          ...(rightJustifyActions
            ? {width: `${frameHeaderSpaceWidth}px`}
            : {maxWidth: '360px'}),
        }}
        onPointerDown={handleHeaderPointerDown}
      >
        <span
          ref={titleRef}
          className={cn(
            'PrototypeFrame__title min-w-0 truncate text-sm font-semibold',
            isSelected ? 'text-info' : 'text-fg'
          )}
        >
          {frame.title}
        </span>
        <div
          className={cn(
            'PrototypeFrame__actions flex shrink-0 items-center gap-0.5',
            rightJustifyActions ? 'ml-auto' : 'ml-1'
          )}
        >
          <IconButton
            size="xs"
            variant="subtle"
            label="Expand"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onExpandFrame(frame.id);
            }}
          >
            <IconArrowsDiagonal />
          </IconButton>
          <Menu
            placement={rightJustifyActions ? 'bottom-end' : 'bottom-start'}
            label={`Actions for ${frame.title}`}
            trigger={
              <IconButton
                size="xs"
                variant="subtle"
                label="More options"
                tooltip={false}
              >
                <IconDotsVertical />
              </IconButton>
            }
          >
            <MenuItem
              icon={<IconExternalLink />}
              onClick={() => onOpenPreview(frame.id)}
            >
              Open preview in new tab
            </MenuItem>
            {canEdit && (
              <>
                <MenuDivider />
                <MenuGroup label="Viewport width">
                  {FRAME_WIDTH_PRESETS.map((preset) => (
                    <MenuItem
                      key={preset.width}
                      icon={preset.icon}
                      hint={frame.width === preset.width ? 'Active' : undefined}
                      onClick={() => onResizeFrame(frame.id, preset.width)}
                    >
                      {preset.label}
                    </MenuItem>
                  ))}
                </MenuGroup>
                <MenuDivider />
                <MenuItem
                  icon={<IconCopy />}
                  onClick={() => onDuplicateFrame(frame.id)}
                >
                  Duplicate frame
                </MenuItem>
                {otherPages.length > 0 && (
                  <MenuGroup label="Move to page">
                    {otherPages.map((page) => (
                      <MenuItem
                        key={page.id}
                        icon={<IconFolderSymlink />}
                        onClick={() => onMoveFrameToPage(frame.id, page.id)}
                      >
                        {page.name}
                      </MenuItem>
                    ))}
                  </MenuGroup>
                )}
              </>
            )}
            <MenuDivider />
            <MenuItem
              icon={<IconPhoto />}
              onClick={() => onExportFrame(frame.id)}
            >
              Export frame as PNG
            </MenuItem>
            {canEdit && (
              <>
                <MenuDivider />
                <MenuItem
                  danger
                  icon={<IconTrash />}
                  onClick={() => onDeleteFrame(frame.id)}
                >
                  Delete frame
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {/* Artboard frame surface with crisp selection ring. */}
      <div
        className={cn(
          'PrototypeFrame__surface relative overflow-visible rounded-md border bg-surface shadow-md transition-shadow',
          isSelected ? 'border-focus ring-2 ring-focus' : 'border-border-strong'
        )}
        style={{
          width: `${frame.width}px`,
          height: `${displayHeight}px`,
        }}
      >
        <div className="PrototypeFrame__viewport relative size-full overflow-hidden rounded-md bg-surface">
          {isLive ? (
            <iframe
              ref={iframeRef}
              className="PrototypeFrame__iframe block border-0 bg-surface"
              sandbox="allow-scripts"
              srcDoc={srcdoc}
              title={frame.title}
              style={{
                width: `${frame.width}px`,
                height: `${displayHeight}px`,
              }}
            />
          ) : (
            <div className="PrototypeFrame__wireframe flex size-full flex-col gap-4 bg-surface p-8">
              {orderedBlocks.map(({key, block}) => (
                <div
                  key={key}
                  className="PrototypeFrame__wireframeBand flex min-h-24 flex-col justify-center gap-2 rounded-md border border-border bg-surface-subtle p-6"
                >
                  <div className="flex items-center gap-2">
                    {block.proposed && (
                      <span className="rounded-sm bg-violet-soft px-2 py-0.5 text-xs font-semibold text-violet-strong">
                        Proposed
                      </span>
                    )}
                    <span className="text-base font-semibold text-fg">
                      {block.label}
                    </span>
                  </div>
                  <div className="h-3 w-2/3 rounded-sm bg-surface-active" />
                  <div className="h-3 w-1/2 rounded-sm bg-surface-hover" />
                </div>
              ))}
            </div>
          )}

          {/* Transparent pointer shield for canvas selection, pan, and comments. */}
          <div
            className={cn(
              'PrototypeFrame__shield absolute inset-0 z-10',
              tool === 'comment'
                ? 'cursor-crosshair'
                : tool === 'pan'
                  ? 'pointer-events-none'
                  : 'cursor-default'
            )}
            onPointerMove={handleShieldPointerMove}
            onPointerLeave={() => setHoveredBlockKey(null)}
            onPointerDown={handleShieldPointerDown}
          />

          {/* Empty frame action button opening Edit with AI with this frame preselected. */}
          {orderedBlocks.length === 0 && (
            <div className="PrototypeFrame__emptyHint pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/90 p-8 text-center">
              <div
                style={{
                  transform: `scale(${hudScale})`,
                  transformOrigin: 'center center',
                }}
              >
                {canEdit && aiAvailable ? (
                  <Button
                    variant="default"
                    size="sm"
                    icon={<IconRobot />}
                    className={cn(
                      tool === 'select'
                        ? 'pointer-events-auto'
                        : 'pointer-events-none'
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFrameWithAi(frame.id);
                    }}
                  >
                    Edit with AI
                  </Button>
                ) : (
                  <span className="text-sm font-medium text-muted">
                    Empty frame
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hovered block subtle outline. */}
        {hoveredBlockRect && (
          <div
            className="PrototypeFrame__hoverOutline pointer-events-none absolute z-20 rounded-sm border border-info-line bg-info-soft/20"
            style={{
              left: `${hoveredBlockRect.left}px`,
              top: `${hoveredBlockRect.top}px`,
              width: `${hoveredBlockRect.width}px`,
              height: `${hoveredBlockRect.height}px`,
            }}
          />
        )}

        {/* Selected block crisp outline + top-left label pill. */}
        {selectedBlockRect && selectedBlock && (
          <div
            className={cn(
              'PrototypeFrame__selectedBlock pointer-events-none absolute z-20 rounded-sm border-2',
              selectedBlock.proposed ? 'border-violet' : 'border-focus'
            )}
            style={{
              left: `${selectedBlockRect.left}px`,
              top: `${selectedBlockRect.top}px`,
              width: `${selectedBlockRect.width}px`,
              height: `${selectedBlockRect.height}px`,
            }}
          >
            <div
              className={cn(
                'PrototypeFrame__selectedBlockPill absolute left-0 bottom-full mb-1 inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-semibold shadow-sm',
                selectedBlock.proposed
                  ? 'bg-violet text-inverse'
                  : 'bg-button-blue text-inverse'
              )}
              style={{
                transform: `scale(${hudScale})`,
                transformOrigin: '0 100%',
              }}
            >
              {selectedBlock.proposed
                ? `Proposed · ${selectedBlock.label}`
                : selectedBlock.label}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
