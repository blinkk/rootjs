import './PrototypeBoardPage.css';

import {
  IconChevronLeft,
  IconChevronRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconExternalLink,
  IconLink,
  IconX,
} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation, useRoute} from 'preact-iso';
import type {
  CanvasCamera,
  PrototypeAnnotation,
  PrototypeAnnotationKind,
  PrototypeBlockRect,
  PrototypeCommentThread,
  PrototypeFrame,
} from '../../../../../shared/prototypes.js';
import {
  fitCameraToBounds,
  focusCameraOnFrame,
  groupFramesBySection,
  PROTOTYPE_LABEL_FONT_SIZE,
  PROTOTYPE_NOTE_WIDTH,
  zoomCameraAroundPoint,
} from '../../../../../shared/prototypes.js';
import {Layout} from '../../../../app/layout/Layout.js';
import {DataLoadError} from '../../../../components/DataLoadError/DataLoadError.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {isEditableTarget} from '../../../../utils/keyboard.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {autokey} from '../../../../utils/rand.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {useCurrentUserPermissions} from '../../../users/useCurrentUserPermissions.js';
import {PrototypeAiCard} from '../../components/PrototypeAiCard/PrototypeAiCard.js';
import {PrototypeCanvas} from '../../components/PrototypeCanvas/PrototypeCanvas.js';
import {
  type PrototypeCommentDraft,
  PrototypeCommentPopover,
  PrototypeCommentsCard,
} from '../../components/PrototypeCommentsCard/PrototypeCommentsCard.js';
import {PrototypeDock} from '../../components/PrototypeDock/PrototypeDock.js';
import type {PrototypeCanvasTool} from '../../components/PrototypeFrame/PrototypeFrame.js';
import {
  type PrototypeSidePanel,
  PrototypeTopBar,
} from '../../components/PrototypeTopBar/PrototypeTopBar.js';
import {
  exportFramesToImage,
  type PrototypeExportPayload,
} from '../../prototype-export.js';
import {
  type PrototypeTabState,
  readPrototypeAiUiState,
  readPrototypeTabState,
  writePrototypeAiUiState,
  writePrototypeTabState,
} from '../../prototype-session.js';
import {
  type PrototypePromptAttachment,
  takeInitialPrototypePrompt,
} from '../../prototypes-client.js';
import {usePrototypeBoard} from '../../usePrototypeBoard.js';

/** Props accepted by `PrototypeBoardPage` via the CMS router. */
export interface PrototypeBoardPageProps {
  /** Prototype board id matched from `/cms/prototypes/:boardId`. */
  boardId?: string;
}

/** Active pin popover anchor state on the canvas. */
interface OpenPinPopover {
  threadId?: string;
  draft?: PrototypeCommentDraft;
  clientX: number;
  clientY: number;
}

/** Zoom multiplier per button click or keyboard zoom step. */
const ZOOM_STEP_FACTOR = 1.25;

/** Reads a query parameter from `useLocation().query` with `window.location.search` fallback. */
function readUrlParam(
  query: Record<string, string | undefined>,
  name: string
): string {
  const fromRouter = query[name];
  if (typeof fromRouter === 'string' && fromRouter) {
    return fromRouter;
  }
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get(name) || '';
  }
  return '';
}

/**
 * Full-bleed infinite canvas workspace for `/cms/prototypes/:boardId`.
 * Keyed per `boardId` so navigating between boards resets local workspace state.
 */
export function PrototypeBoardPage(props: PrototypeBoardPageProps) {
  const {params} = useRoute();
  const boardId = props.boardId || params.boardId || '';
  return <PrototypeBoardWorkspace key={boardId} boardId={boardId} />;
}

/** Inner stateful board workspace scoped to a single `boardId`. */
function PrototypeBoardWorkspace(props: {boardId: string}) {
  const {boardId} = props;
  const {query, route} = useLocation();

  const {
    bundle,
    loading,
    error,
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
    addComment,
    setCommentStatus,
    updateCommentAnchor,
    deleteComment,
    createAnnotation,
    updateAnnotation,
    deleteAnnotations,
    moveItems,
    canUndo,
    canRedo,
    undo,
    redo,
    applyFrameMutated,
    applyAnnotationMutated,
    applyComponentMutated,
    refreshAfterAiTurn,
    setBoardAiChatId,
  } = usePrototypeBoard(boardId);

  const {canEdit, email} = useCurrentUserPermissions();
  const currentUserEmail = email.toLowerCase();
  // Root AI only edits the board, so it is offered to editing roles only.
  const aiAvailable = testAiEnabled() && canEdit;

  usePageTitle(
    bundle?.board.title ? `${bundle.board.title} · Prototypes` : 'Prototypes'
  );

  const initialTabStateRef = useRef<PrototypeTabState | null>(
    readPrototypeTabState(boardId)
  );
  const camerasByPageRef = useRef<Record<string, CanvasCamera>>({
    ...(initialTabStateRef.current?.camerasByPage || {}),
  });

  const [activePageId, setActivePageId] = useState<string>(() => {
    return (
      readUrlParam(query as Record<string, string | undefined>, 'page') ||
      initialTabStateRef.current?.activePageId ||
      ''
    );
  });
  const [camera, setCamera] = useState<CanvasCamera>(() => {
    const startPage =
      readUrlParam(query as Record<string, string | undefined>, 'page') ||
      initialTabStateRef.current?.activePageId ||
      '';
    const saved = startPage
      ? initialTabStateRef.current?.camerasByPage[startPage]
      : undefined;
    return saved || {x: 80, y: 80, zoom: 0.65};
  });
  const [hydrated, setHydrated] = useState(false);

  const [tool, setTool] = useState<PrototypeCanvasTool>('select');
  const [spacePressed, setSpacePressed] = useState(false);
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>(
    []
  );
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null
  );
  // A just-placed annotation that is not saved until it has text.
  const [draftAnnotation, setDraftAnnotation] =
    useState<PrototypeAnnotation | null>(null);
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const [previewViewport, setPreviewViewport] = useState<
    'desktop' | 'tablet' | 'mobile'
  >('desktop');
  const modals = useModals();
  const [activePanel, setActivePanel] = useState<PrototypeSidePanel>(() => {
    const tabPanel = initialTabStateRef.current?.activePanel;
    if (tabPanel !== undefined) {
      return tabPanel;
    }
    return readPrototypeAiUiState(boardId)?.panelOpen ? 'ai' : null;
  });
  const [aiFocusKey, setAiFocusKey] = useState(0);
  const [queuedPrompt, setQueuedPrompt] = useState<{
    id: string | number;
    text: string;
    attachments?: PrototypePromptAttachment[];
  } | null>(null);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [pinPopover, setPinPopover] = useState<OpenPinPopover | null>(null);
  const [exporting, setExporting] = useState(false);

  const viewportElRef = useRef<HTMLDivElement | null>(null);
  const blockRectsByFrameRef = useRef(new Map<string, PrototypeBlockRect[]>());
  const exportersRef = useRef(
    new Map<string, () => Promise<PrototypeExportPayload | null>>()
  );
  const initialFitDoneRef = useRef<string | null>(null);
  const lastAutoFitCountRef = useRef(0);
  const userMovedCameraRef = useRef(false);
  const initialPromptHandledRef = useRef(false);
  const handledUrlFrameRef = useRef<string | null>(null);

  const selectedFrameId =
    selectedFrameIds.length === 1 && selectedAnnotationIds.length === 0
      ? selectedFrameIds[0]
      : null;
  const selectedAnnotationId =
    selectedAnnotationIds.length === 1 && selectedFrameIds.length === 0
      ? selectedAnnotationIds[0]
      : null;

  const computeFrameFocusCamera = useCallback(
    (
      frame: PrototypeFrame,
      panelOverride?: PrototypeSidePanel
    ): CanvasCamera => {
      const el = viewportElRef.current;
      const vw = el?.clientWidth || window.innerWidth || 1280;
      const vh = el?.clientHeight || window.innerHeight || 800;
      const panel = panelOverride !== undefined ? panelOverride : activePanel;
      const visibleVw =
        panel !== null && vw >= 768 ? Math.max(360, vw - 376) : vw;
      return focusCameraOnFrame(
        {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.cachedHeight || 760,
        },
        visibleVw,
        vh,
        88
      );
    },
    [activePanel]
  );

  // Hydrate initial page, frame deeplink (`?frame=`), or saved tab-session
  // scroll/zoom once `bundle` loads and the canvas viewport is mounted.
  useEffect(() => {
    if (!bundle || hydrated) {
      return;
    }
    const pages = bundle.board.pages;
    const savedTab = initialTabStateRef.current;
    const queryFrame = readUrlParam(
      query as Record<string, string | undefined>,
      'frame'
    );
    const queryPage = readUrlParam(
      query as Record<string, string | undefined>,
      'page'
    );

    const targetFrame = queryFrame
      ? bundle.frames.find((frame) => frame.id === queryFrame) || null
      : null;

    if (targetFrame) {
      const isSameTabReload = Boolean(
        savedTab &&
        savedTab.urlFrameId === targetFrame.id &&
        savedTab.camerasByPage[targetFrame.pageId]
      );
      const nextCam = isSameTabReload
        ? savedTab!.camerasByPage[targetFrame.pageId]
        : computeFrameFocusCamera(targetFrame);
      setActivePageId(targetFrame.pageId);
      setSelectedFrameIds([targetFrame.id]);
      setSelectedAnnotationIds([]);
      setSelectedBlockKey(null);
      setCamera(nextCam);
      camerasByPageRef.current[targetFrame.pageId] = nextCam;
      handledUrlFrameRef.current = targetFrame.id;
      initialFitDoneRef.current = `${bundle.board.id}:${targetFrame.pageId}`;
      userMovedCameraRef.current = true;
      setHydrated(true);
      return;
    }

    let resolvedPageId = pages[0]?.id || 'page-1';
    if (queryPage && pages.some((page) => page.id === queryPage)) {
      resolvedPageId = queryPage;
    } else if (
      savedTab?.activePageId &&
      pages.some((page) => page.id === savedTab.activePageId)
    ) {
      resolvedPageId = savedTab.activePageId;
    } else if (activePageId && pages.some((page) => page.id === activePageId)) {
      resolvedPageId = activePageId;
    }

    setActivePageId(resolvedPageId);
    handledUrlFrameRef.current = null;

    const savedCam = savedTab?.camerasByPage[resolvedPageId];
    if (savedCam) {
      setCamera(savedCam);
      camerasByPageRef.current[resolvedPageId] = savedCam;
      initialFitDoneRef.current = `${bundle.board.id}:${resolvedPageId}`;
      userMovedCameraRef.current = true;
    }
    setHydrated(true);
  }, [bundle, hydrated, activePageId, computeFrameFocusCamera, query]);

  // Keep `activePageId` valid if pages change on the board.
  useEffect(() => {
    if (!bundle || !hydrated) {
      return;
    }
    const pages = bundle.board.pages;
    if (pages.length > 0 && !pages.some((page) => page.id === activePageId)) {
      setActivePageId(pages[0].id);
    }
  }, [bundle?.board.pages, hydrated, activePageId]);

  // Prune stale frame/annotation selections if undo/redo removes items.
  useEffect(() => {
    if (!bundle) {
      return;
    }
    const validFrames = new Set(bundle.frames.map((frame) => frame.id));
    setSelectedFrameIds((prev) =>
      prev.every((id) => validFrames.has(id))
        ? prev
        : prev.filter((id) => validFrames.has(id))
    );
    if (expandedFrameId && !validFrames.has(expandedFrameId)) {
      setExpandedFrameId(null);
    }
    const validAnnotations = new Set(bundle.annotations.map((item) => item.id));
    if (draftAnnotation) {
      validAnnotations.add(draftAnnotation.id);
    }
    setSelectedAnnotationIds((prev) =>
      prev.every((id) => validAnnotations.has(id))
        ? prev
        : prev.filter((id) => validAnnotations.has(id))
    );
  }, [bundle, draftAnnotation, expandedFrameId]);

  // Handle external `?frame=` deeplink navigations (e.g. Back/Forward) after
  // initial mount.
  const externalFrameParam = query.frame as string | undefined;
  useEffect(() => {
    if (!bundle || !hydrated || !externalFrameParam) {
      return;
    }
    if (externalFrameParam === handledUrlFrameRef.current) {
      return;
    }
    const targetFrame = bundle.frames.find(
      (frame) => frame.id === externalFrameParam
    );
    if (!targetFrame) {
      return;
    }
    handledUrlFrameRef.current = targetFrame.id;
    setActivePageId(targetFrame.pageId);
    setSelectedFrameIds([targetFrame.id]);
    setSelectedAnnotationIds([]);
    setSelectedBlockKey(null);
    const focused = computeFrameFocusCamera(targetFrame);
    setCamera(focused);
    camerasByPageRef.current[targetFrame.pageId] = focused;
    initialFitDoneRef.current = `${bundle.board.id}:${targetFrame.pageId}`;
    userMovedCameraRef.current = true;
  }, [bundle, hydrated, externalFrameParam, computeFrameFocusCamera]);

  // Auto-open Root AI and queue the prompt entered in NewPrototypeModal, once.
  useEffect(() => {
    if (initialPromptHandledRef.current || !bundle || !aiAvailable) {
      return;
    }
    initialPromptHandledRef.current = true;
    const initialPrompt = takeInitialPrototypePrompt(bundle.board.id);
    if (initialPrompt) {
      setActivePanel('ai');
      writePrototypeAiUiState(boardId, {panelOpen: true});
      setQueuedPrompt({
        id: Date.now(),
        text: initialPrompt.text,
        attachments: initialPrompt.attachments,
      });
    }
  }, [bundle, aiAvailable, boardId]);

  const activePage = useMemo(() => {
    const pages = bundle?.board.pages || [];
    return (
      pages.find((page) => page.id === activePageId) ||
      pages[0] || {id: 'page-1', name: 'Page 1'}
    );
  }, [bundle?.board.pages, activePageId]);

  const pageFrames = useMemo(
    () =>
      (bundle?.frames || []).filter((frame) => frame.pageId === activePage.id),
    [bundle?.frames, activePage.id]
  );

  const pageAnnotations = useMemo(() => {
    const saved = (bundle?.annotations || []).filter(
      (item) => item.pageId === activePage.id
    );
    return draftAnnotation && draftAnnotation.pageId === activePage.id
      ? [...saved, draftAnnotation]
      : saved;
  }, [bundle?.annotations, activePage.id, draftAnnotation]);

  const openCommentCount = useMemo(
    () =>
      (bundle?.comments || []).filter((thread) => thread.status === 'open')
        .length,
    [bundle?.comments]
  );

  const openPageThreads = useMemo(
    () =>
      (bundle?.comments || []).filter(
        (thread) =>
          thread.status === 'open' && thread.anchor.pageId === activePage.id
      ),
    [bundle?.comments, activePage.id]
  );

  const fitActivePageToScreen = useCallback(
    (framesToFit = pageFrames) => {
      const el = viewportElRef.current;
      const vw = el?.clientWidth || window.innerWidth || 1280;
      const vh = el?.clientHeight || window.innerHeight || 800;
      const boxes = framesToFit.map((frame) => ({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.cachedHeight || 760,
      }));
      // Annotation sizes are estimates: they are laid out by the browser.
      for (const item of pageAnnotations) {
        boxes.push(
          item.kind === 'note'
            ? {
                x: item.x,
                y: item.y,
                width: item.width || PROTOTYPE_NOTE_WIDTH,
                height: 160,
              }
            : {
                x: item.x,
                y: item.y,
                width: item.text.length * PROTOTYPE_LABEL_FONT_SIZE * 0.6,
                height: PROTOTYPE_LABEL_FONT_SIZE * 1.25,
              }
        );
      }
      const fitted = fitCameraToBounds(boxes, vw, vh, 96);
      camerasByPageRef.current[activePage.id] = fitted;
      setCamera(fitted);
    },
    [pageFrames, pageAnnotations, activePage.id]
  );

  const aiGenerating = aiAvailable && (aiStreaming || Boolean(queuedPrompt));

  // Fit frames to viewport on initial board load (when no deeplink or saved
  // tab camera applies), when switching to an unvisited page, and as Root AI
  // populates an initially empty page with side-by-side variants.
  useEffect(() => {
    if (!bundle || !hydrated || !activePage.id) {
      return;
    }
    const fitKey = `${bundle.board.id}:${activePage.id}`;
    if (initialFitDoneRef.current === fitKey) {
      return;
    }
    if (pageFrames.length > 0) {
      if (
        !userMovedCameraRef.current &&
        pageFrames.length !== lastAutoFitCountRef.current
      ) {
        lastAutoFitCountRef.current = pageFrames.length;
        fitActivePageToScreen(pageFrames);
      }
      if (!aiGenerating) {
        initialFitDoneRef.current = fitKey;
      }
    } else if (
      lastAutoFitCountRef.current === 0 &&
      !userMovedCameraRef.current
    ) {
      fitActivePageToScreen(pageFrames);
    }
  }, [
    bundle?.board.id,
    hydrated,
    activePage.id,
    pageFrames,
    aiGenerating,
    fitActivePageToScreen,
  ]);

  // Sync `?page=` and `?frame=` query parameters to the URL bar.
  useEffect(() => {
    if (!bundle || !hydrated || typeof window === 'undefined') {
      return;
    }
    handledUrlFrameRef.current = selectedFrameId;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('page', activePage.id);
    if (selectedFrameId) {
      nextUrl.searchParams.set('frame', selectedFrameId);
    } else {
      nextUrl.searchParams.delete('frame');
    }
    const nextHref = nextUrl.pathname + nextUrl.search + nextUrl.hash;
    const curHref =
      window.location.pathname + window.location.search + window.location.hash;
    if (nextHref !== curHref) {
      window.history.replaceState(null, '', nextHref);
    }
  }, [bundle, hydrated, activePage.id, selectedFrameId]);

  // Persist tab-scoped camera (scroll/zoom), active page, URL frame, and side
  // panel in `sessionStorage` so returning in the same tab or reloading keeps
  // the user's exact viewport position.
  const latestTabStateRef = useRef<PrototypeTabState | null>(null);
  useEffect(() => {
    if (!bundle || !hydrated) {
      return;
    }
    camerasByPageRef.current[activePage.id] = camera;
    const snapshot: PrototypeTabState = {
      activePageId: activePage.id,
      camerasByPage: {...camerasByPageRef.current},
      urlFrameId: selectedFrameId,
      activePanel,
    };
    latestTabStateRef.current = snapshot;
    const rafId = window.requestAnimationFrame(() => {
      if (latestTabStateRef.current) {
        writePrototypeTabState(boardId, latestTabStateRef.current);
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    bundle,
    hydrated,
    boardId,
    activePage.id,
    camera,
    selectedFrameId,
    activePanel,
  ]);

  useEffect(() => {
    const flushTabState = () => {
      if (latestTabStateRef.current) {
        writePrototypeTabState(boardId, latestTabStateRef.current);
      }
    };
    window.addEventListener('pagehide', flushTabState);
    return () => {
      window.removeEventListener('pagehide', flushTabState);
      flushTabState();
    };
  }, [boardId]);

  // Persist per-user Root AI open/closed panel preference on this board.
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writePrototypeAiUiState(boardId, {panelOpen: activePanel === 'ai'});
  }, [boardId, hydrated, activePanel]);

  const handleSelectPage = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      setSelectedFrameIds([]);
      setSelectedAnnotationIds([]);
      setSelectedBlockKey(null);
      setEditingAnnotationId(null);
      setDraftAnnotation(null);
      setPinPopover(null);
      const savedPageCam = camerasByPageRef.current[pageId];
      if (savedPageCam && bundle) {
        setCamera(savedPageCam);
        initialFitDoneRef.current = `${bundle.board.id}:${pageId}`;
        userMovedCameraRef.current = true;
      } else {
        lastAutoFitCountRef.current = 0;
        userMovedCameraRef.current = false;
      }
    },
    [bundle]
  );

  const handleOpenFramePreview = useCallback(
    (frameId: string) => {
      const previewUrl = `/cms/prototypes-preview/${encodeURIComponent(boardId)}/${encodeURIComponent(frameId)}`;
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    },
    [boardId]
  );

  const handleCopyFrameLink = useCallback(
    async (frameId: string) => {
      const frame = bundle?.frames.find((item) => item.id === frameId);
      if (!frame) {
        return;
      }
      const url = new URL(window.location.href);
      url.pathname = `/cms/prototypes/${boardId}`;
      url.searchParams.set('page', frame.pageId);
      url.searchParams.set('frame', frame.id);
      url.searchParams.delete('prompt');
      try {
        await navigator.clipboard.writeText(url.toString());
        showNotification({
          title: 'Link copied to clipboard',
          message: `Share link for "${frame.title}".`,
          color: 'green',
        });
      } catch (err) {
        showNotification({
          title: 'Could not copy link',
          message: errorMessage(err),
          color: 'red',
        });
      }
    },
    [boardId, bundle?.frames]
  );

  const handleEditFrameWithAi = useCallback((frameId: string) => {
    setSelectedFrameIds([frameId]);
    setSelectedAnnotationIds([]);
    setSelectedBlockKey(null);
    setActivePanel('ai');
    setAiFocusKey((prev) => prev + 1);
  }, []);

  const handleNewFrame = useCallback(async () => {
    if (!canEdit || !bundle) {
      return;
    }
    try {
      const created = await createFrame({pageId: activePage.id});
      setSelectedFrameIds([created.id]);
      setSelectedAnnotationIds([]);
      setSelectedBlockKey(null);
      // Pan camera smoothly to center on the newly created frame.
      const el = viewportElRef.current;
      const vw = el?.clientWidth || window.innerWidth || 1280;
      const vh = el?.clientHeight || window.innerHeight || 800;
      const nextCam = fitCameraToBounds(
        [
          {
            x: created.x,
            y: created.y,
            width: created.width,
            height: created.cachedHeight || 760,
          },
        ],
        vw,
        vh,
        96
      );
      userMovedCameraRef.current = true;
      setCamera(nextCam);
    } catch (err) {
      showNotification({
        title: 'Could not create frame',
        message: errorMessage(err),
        color: 'red',
      });
    }
  }, [canEdit, bundle, createFrame, activePage.id]);

  const handleSelectAnnotation = useCallback((annotationId: string) => {
    setSelectedAnnotationIds([annotationId]);
    setSelectedFrameIds([]);
    setSelectedBlockKey(null);
    setPinPopover(null);
  }, []);

  const handleSelectGroup = useCallback(
    (frameIds: string[], annotationIds: string[]) => {
      setSelectedFrameIds(frameIds);
      setSelectedAnnotationIds(annotationIds);
      setSelectedBlockKey(null);
      if (frameIds.length === 0 && annotationIds.length === 0) {
        setPinPopover(null);
      }
    },
    []
  );

  const handleCreateAnnotation = useCallback(
    (kind: PrototypeAnnotationKind, worldX: number, worldY: number) => {
      if (!canEdit) {
        return;
      }
      const now = Date.now();
      const id = `${kind}-${autokey(8).toLowerCase()}`;
      setDraftAnnotation({
        id,
        boardId,
        pageId: activePage.id,
        kind,
        text: '',
        x: worldX,
        y: worldY,
        createdAt: now,
        createdBy: currentUserEmail,
        updatedAt: now,
        updatedBy: currentUserEmail,
      });
      setTool('select');
      handleSelectAnnotation(id);
      setEditingAnnotationId(id);
    },
    [canEdit, boardId, activePage.id, currentUserEmail, handleSelectAnnotation]
  );

  const handleDeleteAnnotations = useCallback(
    (annotationIds: string[]) => {
      if (annotationIds.length === 0) {
        return;
      }
      const toDelete = new Set(annotationIds);
      setSelectedAnnotationIds((prev) =>
        prev.filter((id) => !toDelete.has(id))
      );
      deleteAnnotations(annotationIds).catch((err) => {
        showNotification({
          title: 'Could not delete annotation',
          message: errorMessage(err),
          color: 'red',
        });
      });
    },
    [deleteAnnotations]
  );

  const handleUndo = useCallback(() => {
    if (!canEdit) {
      return;
    }
    undo().catch((err) => {
      showNotification({
        title: 'Could not undo',
        message: errorMessage(err),
        color: 'red',
      });
    });
  }, [canEdit, undo]);

  const handleRedo = useCallback(() => {
    if (!canEdit) {
      return;
    }
    redo().catch((err) => {
      showNotification({
        title: 'Could not redo',
        message: errorMessage(err),
        color: 'red',
      });
    });
  }, [canEdit, redo]);

  const handleCommitAnnotation = useCallback(
    (annotationId: string, text: string) => {
      setEditingAnnotationId((prev) => (prev === annotationId ? null : prev));
      const trimmed = text.trim();
      if (draftAnnotation?.id === annotationId) {
        setDraftAnnotation(null);
        if (!trimmed) {
          setSelectedAnnotationIds((prev) =>
            prev.filter((id) => id !== annotationId)
          );
          return;
        }
        createAnnotation({...draftAnnotation, text: trimmed}).catch((err) => {
          showNotification({
            title: 'Could not save annotation',
            message: errorMessage(err),
            color: 'red',
          });
        });
        return;
      }
      if (!trimmed) {
        handleDeleteAnnotations([annotationId]);
        return;
      }
      const existing = bundle?.annotations.find(
        (item) => item.id === annotationId
      );
      if (!existing || existing.text === trimmed) {
        return;
      }
      updateAnnotation({id: annotationId, text: trimmed}).catch((err) => {
        showNotification({
          title: 'Could not save annotation',
          message: errorMessage(err),
          color: 'red',
        });
      });
    },
    [
      bundle?.annotations,
      draftAnnotation,
      createAnnotation,
      updateAnnotation,
      handleDeleteAnnotations,
    ]
  );

  const handleCancelAnnotationEdit = useCallback(
    (annotationId: string) => {
      setEditingAnnotationId((prev) => (prev === annotationId ? null : prev));
      if (draftAnnotation?.id === annotationId) {
        setDraftAnnotation(null);
        setSelectedAnnotationIds((prev) =>
          prev.filter((id) => id !== annotationId)
        );
      }
    },
    [draftAnnotation]
  );

  const handleDragAnnotation = useCallback(
    (annotationId: string, x: number, y: number, persist: boolean) => {
      updateAnnotation({id: annotationId, x, y}, {persist}).catch((err) => {
        showNotification({
          title: 'Could not move annotation',
          message: errorMessage(err),
          color: 'red',
        });
      });
    },
    [updateAnnotation]
  );

  const handleMoveItems = useCallback(
    (
      moves: {
        frames?: Array<{id: string; x: number; y: number}>;
        annotations?: Array<{id: string; x: number; y: number}>;
      },
      persist: boolean
    ) => {
      moveItems(moves, persist).catch((err) => {
        showNotification({
          title: 'Could not move selection',
          message: errorMessage(err),
          color: 'red',
        });
      });
    },
    [moveItems]
  );

  const handleZoomBy = useCallback((factor: number) => {
    const el = viewportElRef.current;
    const cx = (el?.clientWidth || window.innerWidth || 1280) / 2;
    const cy = (el?.clientHeight || window.innerHeight || 800) / 2;
    setCamera((prev) =>
      zoomCameraAroundPoint(prev, prev.zoom * factor, cx, cy)
    );
  }, []);

  // Canvas keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z or Ctrl+Y
  // (redo), and single-key tools (V, H, F, C, N, T, Space, Escape, Delete, 0,
  // +, -).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore key repeat (a held `F` would create a frame per repeat) and
      // keys pressed while a modal dialog is open over the canvas.
      if (
        expandedFrameId ||
        e.repeat ||
        isEditableTarget(e.target) ||
        document.querySelector('dialog[open]')
      ) {
        return;
      }
      if (canEdit && (e.metaKey || e.ctrlKey) && !e.altKey) {
        const lowerKey = e.key.toLowerCase();
        if (lowerKey === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (
          (lowerKey === 'z' && e.shiftKey) ||
          (!e.metaKey && lowerKey === 'y')
        ) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (pinPopover) {
          setPinPopover(null);
          return;
        }
        if (tool !== 'select') {
          setTool('select');
          return;
        }
        setSelectedAnnotationIds([]);
        setSelectedBlockKey(null);
        setSelectedFrameIds([]);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // The editor is an input, so this never fires while editing text.
        if (
          canEdit &&
          selectedAnnotationIds.length > 0 &&
          selectedFrameIds.length === 0
        ) {
          e.preventDefault();
          handleDeleteAnnotations(selectedAnnotationIds);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'v') {
        e.preventDefault();
        setTool('select');
      } else if (key === 'h') {
        e.preventDefault();
        setTool('pan');
      } else if (key === 'f' && canEdit) {
        e.preventDefault();
        handleNewFrame();
      } else if (key === 'c') {
        e.preventDefault();
        setTool((prev) => (prev === 'comment' ? 'select' : 'comment'));
      } else if (key === 'n' && canEdit) {
        e.preventDefault();
        setTool((prev) => (prev === 'note' ? 'select' : 'note'));
      } else if (key === 't' && canEdit) {
        e.preventDefault();
        setTool((prev) => (prev === 'text' ? 'select' : 'text'));
      } else if (key === '0') {
        e.preventDefault();
        fitActivePageToScreen();
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        userMovedCameraRef.current = true;
        handleZoomBy(ZOOM_STEP_FACTOR);
      } else if (key === '-') {
        e.preventDefault();
        userMovedCameraRef.current = true;
        handleZoomBy(1 / ZOOM_STEP_FACTOR);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    }

    function onBlur() {
      setSpacePressed(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    canEdit,
    expandedFrameId,
    pinPopover,
    tool,
    selectedAnnotationIds,
    selectedFrameIds,
    handleDeleteAnnotations,
    handleUndo,
    handleRedo,
    handleNewFrame,
    fitActivePageToScreen,
    handleZoomBy,
  ]);

  const handleRegisterExporter = useCallback(
    (
      frameId: string,
      exporter: (() => Promise<PrototypeExportPayload | null>) | null
    ) => {
      if (exporter) {
        exportersRef.current.set(frameId, exporter);
      } else {
        exportersRef.current.delete(frameId);
      }
    },
    []
  );

  const handleFrameLayout = useCallback(
    (frameId: string, height: number, blockRects: PrototypeBlockRect[]) => {
      blockRectsByFrameRef.current.set(frameId, blockRects);
      updateFrameCachedHeight(frameId, height);
    },
    [updateFrameCachedHeight]
  );

  const handleExportFrames = useCallback(
    async (targetFrameId?: string) => {
      if (!bundle) {
        return;
      }
      let framesToExport: PrototypeFrame[] = [];
      if (targetFrameId) {
        const chosen =
          pageFrames.find((frame) => frame.id === targetFrameId) ||
          bundle.frames.find((frame) => frame.id === targetFrameId);
        if (chosen) {
          framesToExport = [chosen];
        }
      } else if (selectedFrameIds.length > 0) {
        const selectedSet = new Set(selectedFrameIds);
        framesToExport = pageFrames.filter((frame) =>
          selectedSet.has(frame.id)
        );
      } else {
        framesToExport = pageFrames;
      }
      if (framesToExport.length === 0) {
        showNotification({
          title: 'Nothing to export',
          message: 'Add at least one frame to this page before exporting.',
          color: 'yellow',
        });
        return;
      }
      setExporting(true);
      try {
        await exportFramesToImage({
          boardTitle: bundle.board.title,
          frames: framesToExport,
          theme: bundle.board.theme,
          format: 'png',
          requestExportPayload: async (frameId) => {
            const exporter = exportersRef.current.get(frameId);
            return exporter ? exporter() : null;
          },
        });
        showNotification({
          title: 'Exported PNG',
          message:
            framesToExport.length === 1
              ? `Downloaded "${framesToExport[0].title}" at 2x resolution.`
              : `Downloaded ${framesToExport.length} frames from "${activePage.name}" at 2x resolution.`,
          color: 'green',
        });
      } finally {
        setExporting(false);
      }
    },
    [bundle, selectedFrameIds, pageFrames, activePage.name]
  );

  const handleNavigateToThread = useCallback(
    (thread: PrototypeCommentThread) => {
      if (!bundle) {
        return;
      }
      if (thread.anchor.pageId !== activePage.id) {
        handleSelectPage(thread.anchor.pageId);
        // Prevent the page-switch auto-fit effect from overriding this focus camera.
        initialFitDoneRef.current = `${bundle.board.id}:${thread.anchor.pageId}`;
      }
      const el = viewportElRef.current;
      const bounds = el?.getBoundingClientRect();
      const vw = el?.clientWidth || window.innerWidth || 1280;
      const vh = el?.clientHeight || window.innerHeight || 800;
      const visibleVw =
        activePanel !== null && vw >= 768 ? Math.max(360, vw - 376) : vw;

      let nextCamera: CanvasCamera;
      let pinWorldX = thread.anchor.fallbackX;
      let pinWorldY = thread.anchor.fallbackY;

      const frame = thread.anchor.frameId
        ? bundle.frames.find((item) => item.id === thread.anchor.frameId)
        : null;

      if (frame) {
        setSelectedFrameIds([frame.id]);
        setSelectedAnnotationIds([]);
        setSelectedBlockKey(thread.anchor.blockKey || null);
        const rects = blockRectsByFrameRef.current.get(frame.id) || [];
        const blockRect = thread.anchor.blockKey
          ? rects.find((r) => r.blockKey === thread.anchor.blockKey)
          : null;
        const frameHeight = Math.max(240, frame.cachedHeight || 760);
        if (blockRect && blockRect.width > 0 && blockRect.height > 0) {
          pinWorldX =
            frame.x + blockRect.left + thread.anchor.relX * blockRect.width;
          pinWorldY =
            frame.y + blockRect.top + thread.anchor.relY * blockRect.height;
        } else {
          pinWorldX =
            frame.x +
            (thread.anchor.fallbackX ?? frame.width * thread.anchor.relX);
          pinWorldY =
            frame.y +
            (thread.anchor.fallbackY ?? frameHeight * thread.anchor.relY);
        }
        const targetBox = blockRect
          ? {
              x: frame.x + blockRect.left,
              y: frame.y + blockRect.top,
              width: Math.max(320, blockRect.width),
              height: Math.max(240, blockRect.height),
            }
          : {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frameHeight,
            };
        nextCamera = fitCameraToBounds([targetBox], visibleVw, vh, 120);
      } else {
        // Free-floating canvas pin: center the visible viewport on its world coordinates.
        const zoom = Math.max(camera.zoom, 0.75);
        nextCamera = {
          x: Math.round(visibleVw / 2 - pinWorldX * zoom),
          y: Math.round(vh / 2 - pinWorldY * zoom),
          zoom,
        };
      }

      userMovedCameraRef.current = true;
      setCamera(nextCamera);
      setPinPopover({
        threadId: thread.id,
        clientX: Math.round(
          (bounds?.left || 0) + nextCamera.x + pinWorldX * nextCamera.zoom
        ),
        clientY: Math.round(
          (bounds?.top || 0) + nextCamera.y + pinWorldY * nextCamera.zoom
        ),
      });
    },
    [bundle, activePage.id, activePanel, handleSelectPage, camera.zoom]
  );

  const handleAddressCommentsInAi = useCallback(() => {
    setPinPopover(null);
    setActivePanel('ai');
    setQueuedPrompt({id: Date.now(), text: '/address-comments '});
  }, []);

  // Switches the right-hand panel. Leaving Root AI mid-response stops that
  // response, so ask first.
  const changePanel = useCallback(
    (next: PrototypeSidePanel) => {
      if (activePanel !== 'ai' || next === 'ai' || !aiStreaming) {
        setActivePanel(next);
        return;
      }
      modals.openConfirmModal({
        title: 'Root AI is still working',
        centered: true,
        children: (
          <Text as="p" size="body-sm" className="m-0">
            Closing Root AI now stops the response in progress. Changes it has
            already made to the board are kept.
          </Text>
        ),
        labels: {confirm: 'Stop and close', cancel: 'Keep working'},
        onConfirm: () => setActivePanel(next),
      });
    },
    [activePanel, aiStreaming, modals]
  );

  const handleTogglePanel = useCallback(
    (panel: Exclude<PrototypeSidePanel, null>) => {
      changePanel(activePanel === panel ? null : panel);
    },
    [activePanel, changePanel]
  );

  const activePopoverThread = useMemo(() => {
    if (!pinPopover?.threadId || !bundle) {
      return null;
    }
    return (
      bundle.comments.find((thread) => thread.id === pinPopover.threadId) ||
      null
    );
  }, [pinPopover?.threadId, bundle]);

  const effectiveActivePanel =
    activePanel === 'ai' && !aiAvailable ? null : activePanel;

  const expandedFrame = useMemo(
    () =>
      expandedFrameId && bundle
        ? bundle.frames.find((frame) => frame.id === expandedFrameId) || null
        : null,
    [expandedFrameId, bundle]
  );

  useEffect(() => {
    if (!expandedFrame) {
      return;
    }
    if (expandedFrame.width <= 480) {
      setPreviewViewport('mobile');
    } else if (expandedFrame.width <= 900) {
      setPreviewViewport('tablet');
    } else {
      setPreviewViewport('desktop');
    }
  }, [expandedFrame?.id]);

  const orderedPreviewFrames = useMemo(() => {
    if (!expandedFrame || !bundle) {
      return [];
    }
    const {unsectioned, sections} = groupFramesBySection(
      bundle.frames,
      bundle.annotations,
      expandedFrame.pageId
    );
    return [...unsectioned, ...sections.flatMap((section) => section.frames)];
  }, [expandedFrame?.pageId, bundle?.frames, bundle?.annotations]);

  const expandedFrameIndex = useMemo(
    () =>
      expandedFrame
        ? orderedPreviewFrames.findIndex(
            (frame) => frame.id === expandedFrame.id
          )
        : -1,
    [expandedFrame, orderedPreviewFrames]
  );
  const prevPreviewFrame =
    expandedFrameIndex > 0
      ? orderedPreviewFrames[expandedFrameIndex - 1]
      : null;
  const nextPreviewFrame =
    expandedFrameIndex >= 0 &&
    expandedFrameIndex < orderedPreviewFrames.length - 1
      ? orderedPreviewFrames[expandedFrameIndex + 1]
      : null;

  const handleStepPreviewFrame = useCallback(
    (target: PrototypeFrame | null) => {
      if (!target) {
        return;
      }
      setExpandedFrameId(target.id);
      setSelectedFrameIds([target.id]);
      setSelectedAnnotationIds([]);
      setSelectedBlockKey(null);
    },
    []
  );

  // ArrowLeft / ArrowRight step between frames in full-screen presentation mode.
  useEffect(() => {
    if (!expandedFrame) {
      return;
    }
    function onPreviewKeyDown(e: KeyboardEvent) {
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isEditableTarget(e.target)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft' && prevPreviewFrame) {
        e.preventDefault();
        handleStepPreviewFrame(prevPreviewFrame);
      } else if (e.key === 'ArrowRight' && nextPreviewFrame) {
        e.preventDefault();
        handleStepPreviewFrame(nextPreviewFrame);
      }
    }
    window.addEventListener('keydown', onPreviewKeyDown);
    return () => {
      window.removeEventListener('keydown', onPreviewKeyDown);
    };
  }, [
    expandedFrame,
    prevPreviewFrame,
    nextPreviewFrame,
    handleStepPreviewFrame,
  ]);

  if (loading) {
    return (
      <Layout>
        <div className="PrototypeBoardPage flex items-center justify-center bg-page">
          <Spinner size="lg" label="Loading prototype board" />
        </div>
      </Layout>
    );
  }

  if (error || !bundle) {
    return (
      <Layout>
        <div className="PrototypeBoardPage flex items-center justify-center bg-page p-page">
          <DataLoadError
            title="Could not load prototype board"
            error={error || new Error('Prototype board not found.')}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="PrototypeBoardPage relative overflow-hidden bg-page">
        {/* Top floating bar (breadcrumb + board menu + pages + Comments/AI toggle). */}
        <PrototypeTopBar
          board={bundle.board}
          frames={bundle.frames}
          activePageId={activePage.id}
          openCommentCount={openCommentCount}
          activePanel={effectiveActivePanel}
          aiAvailable={aiAvailable}
          canEdit={canEdit}
          exporting={exporting}
          onSelectPage={handleSelectPage}
          onAddPage={async (name) => {
            const created = await addPage(name);
            if (created) {
              handleSelectPage(created.id);
            }
          }}
          onRenamePage={renamePage}
          onRenameBoard={renameBoard}
          onDuplicateBoard={async () => {
            const duplicated = await duplicateBoard();
            showNotification({
              title: 'Prototype duplicated',
              message: `Opened "${duplicated.title}".`,
              color: 'green',
            });
            route(`/cms/prototypes/${duplicated.id}`);
          }}
          onExport={() => handleExportFrames()}
          onToggleArchive={async () => {
            const nextStatus =
              bundle.board.status === 'archived' ? 'active' : 'archived';
            await updateBoardStatus(nextStatus);
            showNotification({
              title:
                nextStatus === 'archived'
                  ? 'Prototype archived'
                  : 'Prototype restored',
              message:
                nextStatus === 'archived'
                  ? 'Moved to the Archived tab on Prototypes.'
                  : 'Restored to Active prototypes.',
              color: 'green',
            });
          }}
          onDeleteBoard={async () => {
            await deleteBoard();
            showNotification({
              title: 'Prototype deleted',
              message: `Deleted "${bundle.board.title}".`,
              color: 'green',
            });
            route('/cms/prototypes');
          }}
          onTogglePanel={handleTogglePanel}
        />

        {/* Infinite dot-grid canvas within the CMS main frame. */}
        <PrototypeCanvas
          frames={pageFrames}
          theme={bundle.board.theme}
          activePage={activePage}
          pages={bundle.board.pages}
          camera={camera}
          onChangeCamera={(next) => {
            userMovedCameraRef.current = true;
            setCamera(next);
          }}
          tool={tool}
          spacePressed={spacePressed}
          selectedFrameId={selectedFrameId}
          selectedFrameIds={selectedFrameIds}
          selectedBlockKey={selectedBlockKey}
          openThreads={openPageThreads}
          activeThreadId={pinPopover?.threadId || null}
          canEdit={canEdit}
          currentUserEmail={currentUserEmail}
          aiAvailable={aiAvailable}
          aiGenerating={aiGenerating}
          sidePanelOpen={effectiveActivePanel !== null}
          onViewportElement={(el) => {
            viewportElRef.current = el;
          }}
          annotations={pageAnnotations}
          selectedAnnotationId={selectedAnnotationId}
          selectedAnnotationIds={selectedAnnotationIds}
          editingAnnotationId={editingAnnotationId}
          onCreateAnnotation={handleCreateAnnotation}
          onSelectAnnotation={handleSelectAnnotation}
          onSelectGroup={handleSelectGroup}
          onEditAnnotation={(annotationId) => {
            handleSelectAnnotation(annotationId);
            setEditingAnnotationId(annotationId);
          }}
          onCommitAnnotation={handleCommitAnnotation}
          onCancelAnnotationEdit={handleCancelAnnotationEdit}
          onDragAnnotation={handleDragAnnotation}
          onMoveItems={handleMoveItems}
          onSelect={(frameId, blockKey) => {
            if (!frameId) {
              setSelectedFrameIds([]);
              setSelectedAnnotationIds([]);
              setSelectedBlockKey(null);
              setPinPopover(null);
              return;
            }
            setSelectedFrameIds([frameId]);
            setSelectedAnnotationIds([]);
            setSelectedBlockKey(blockKey);
          }}
          onExpandFrame={(frameId) => setExpandedFrameId(frameId)}
          onOpenPreview={handleOpenFramePreview}
          onCopyFrameLink={handleCopyFrameLink}
          onEditFrameWithAi={handleEditFrameWithAi}
          onDragFramePosition={updateFramePosition}
          onDropCommentPin={(anchor, anchorLabel, clientX, clientY) => {
            setPinPopover({
              draft: {anchor, anchorLabel, clientX, clientY},
              clientX,
              clientY,
            });
          }}
          onSelectCommentThread={(thread, clientX, clientY) => {
            setPinPopover({
              threadId: thread.id,
              clientX,
              clientY,
            });
          }}
          onMoveComment={updateCommentAnchor}
          onStartDragComment={() => setPinPopover(null)}
          onFrameLayout={handleFrameLayout}
          onRegisterExporter={handleRegisterExporter}
          onDuplicateFrame={(frameId) => {
            duplicateFrame(frameId)
              .then((created) => {
                if (created) {
                  setSelectedFrameIds([created.id]);
                  setSelectedAnnotationIds([]);
                  setSelectedBlockKey(null);
                }
              })
              .catch((err) => {
                showNotification({
                  title: 'Could not duplicate frame',
                  message: errorMessage(err),
                  color: 'red',
                });
              });
          }}
          onRenameFrame={(frameId, title) => {
            saveFrame({id: frameId, title}).catch((err) => {
              showNotification({
                title: 'Could not rename frame',
                message: errorMessage(err),
                color: 'red',
              });
            });
          }}
          onResizeFrame={(frameId, width) => {
            saveFrame({id: frameId, width}).catch((err) => {
              showNotification({
                title: 'Could not resize frame',
                message: errorMessage(err),
                color: 'red',
              });
            });
          }}
          onMoveFrameToPage={(frameId, targetPageId) => {
            moveFrameToPage(frameId, targetPageId)
              .then(() => {
                setSelectedFrameIds((prev) =>
                  prev.filter((id) => id !== frameId)
                );
                const targetPage = bundle.board.pages.find(
                  (page) => page.id === targetPageId
                );
                showNotification({
                  title: 'Frame moved',
                  message: `Moved to "${targetPage?.name || targetPageId}".`,
                  color: 'green',
                });
              })
              .catch((err) => {
                showNotification({
                  title: 'Could not move frame',
                  message: errorMessage(err),
                  color: 'red',
                });
              });
          }}
          onExportFrame={(frameId) => {
            handleExportFrames(frameId).catch((err) => {
              showNotification({
                title: 'Could not export PNG',
                message: errorMessage(err),
                color: 'red',
              });
            });
          }}
          onDeleteFrame={(frameId) => {
            deleteFrame(frameId)
              .then(() => {
                setSelectedFrameIds((prev) =>
                  prev.filter((id) => id !== frameId)
                );
                if (selectedFrameId === frameId) {
                  setSelectedBlockKey(null);
                }
                if (expandedFrameId === frameId) {
                  setExpandedFrameId(null);
                }
              })
              .catch((err) => {
                showNotification({
                  title: 'Could not delete frame',
                  message: errorMessage(err),
                  color: 'red',
                });
              });
          }}
          onNewFrame={handleNewFrame}
          onOpenAi={() => {
            setActivePanel('ai');
            setAiFocusKey((prev) => prev + 1);
          }}
        />

        {/* Bottom-center floating tools & zoom dock. */}
        <PrototypeDock
          tool={spacePressed ? 'pan' : tool}
          zoom={camera.zoom}
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onChangeTool={(nextTool) => {
            setTool(nextTool);
          }}
          onNewFrame={handleNewFrame}
          onZoomOut={() => {
            userMovedCameraRef.current = true;
            handleZoomBy(1 / ZOOM_STEP_FACTOR);
          }}
          onFitToScreen={() => {
            userMovedCameraRef.current = false;
            fitActivePageToScreen();
          }}
          onZoomIn={() => {
            userMovedCameraRef.current = true;
            handleZoomBy(ZOOM_STEP_FACTOR);
          }}
        />

        {/* Floating pin thread or new-comment popover anchored on the canvas. */}
        {pinPopover && (
          <PrototypeCommentPopover
            thread={activePopoverThread}
            draft={pinPopover.draft}
            clientX={pinPopover.clientX}
            clientY={pinPopover.clientY}
            onCreateThread={async (input) => {
              const created = await addComment(input);
              setTool('select');
              setPinPopover({
                threadId: created.id,
                clientX: pinPopover.clientX,
                clientY: pinPopover.clientY,
              });
            }}
            onAddReply={async (input) => {
              await addComment(input);
            }}
            onSetThreadStatus={async (threadId, status) => {
              await setCommentStatus(threadId, status);
              if (status === 'resolved') {
                setPinPopover(null);
              }
            }}
            onDeleteComment={deleteComment}
            onClose={() => setPinPopover(null)}
          />
        )}

        {/* Right-hand floating Comments card (or mobile Dialog sheet below md). */}
        {effectiveActivePanel === 'comments' && (
          <PrototypeCommentsCard
            threads={bundle.comments}
            activePageId={activePage.id}
            aiAvailable={aiAvailable}
            activeThreadId={pinPopover?.threadId || null}
            onNavigateToThread={handleNavigateToThread}
            onAddReply={async (input) => {
              await addComment(input);
            }}
            onSetThreadStatus={async (threadId, status) => {
              await setCommentStatus(threadId, status);
            }}
            onDeleteComment={deleteComment}
            onAddressCommentsInAi={handleAddressCommentsInAi}
            onClose={() => setActivePanel(null)}
          />
        )}

        {/* Right-hand floating Root AI card (only one right panel open at a time). */}
        {effectiveActivePanel === 'ai' && aiAvailable && (
          <PrototypeAiCard
            bundle={bundle}
            activePageId={activePage.id}
            selectedFrameId={selectedFrameId}
            selectedBlockKey={selectedBlockKey}
            queuedPrompt={queuedPrompt}
            focusKey={aiFocusKey}
            onQueuedPromptHandled={() => setQueuedPrompt(null)}
            onStreamingChange={setAiStreaming}
            onClearContext={(kind) => {
              if (kind === 'block') {
                setSelectedBlockKey(null);
              } else {
                setSelectedFrameIds([]);
                setSelectedBlockKey(null);
              }
            }}
            onFrameMutated={(frame) => {
              applyFrameMutated(frame);
              if (frame.pageId === activePage.id) {
                setSelectedFrameIds([frame.id]);
                setSelectedAnnotationIds([]);
              }
            }}
            onAnnotationMutated={applyAnnotationMutated}
            onComponentMutated={applyComponentMutated}
            onTurnFinished={refreshAfterAiTurn}
            onChatLinked={setBoardAiChatId}
            onClose={() => changePanel(null)}
          />
        )}

        {/* Full-screen interactive frame preview modal (Esc to exit). */}
        {(() => {
          const expandedPreviewUrl = expandedFrame
            ? `/cms/prototypes-preview/${encodeURIComponent(boardId)}/${encodeURIComponent(expandedFrame.id)}`
            : '';
          const previewWidth =
            previewViewport === 'mobile'
              ? '390px'
              : previewViewport === 'tablet'
                ? '768px'
                : '100%';
          return (
            <Dialog
              open={Boolean(expandedFrame)}
              onClose={() => setExpandedFrameId(null)}
              withCloseButton={false}
              size="full"
              aria-label={
                expandedFrame
                  ? `${expandedFrame.title} full screen preview`
                  : 'Full screen preview'
              }
              style={{padding: 0}}
              className="PrototypeBoardPage__fullscreenDialog"
              classNames={{
                panel:
                  'size-full overflow-hidden rounded-none md:rounded-none md:border-0',
                body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 pt-0',
              }}
            >
              {expandedFrame && (
                <>
                  <div className="PrototypeBoardPage__fullscreenBar flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
                    <div className="PrototypeBoardPage__fullscreenNav flex min-w-0 items-center gap-1.5">
                      {orderedPreviewFrames.length > 1 && (
                        <>
                          <IconButton
                            size="xs"
                            variant="subtle"
                            label="Previous frame (←)"
                            disabled={!prevPreviewFrame}
                            onClick={() =>
                              handleStepPreviewFrame(prevPreviewFrame)
                            }
                          >
                            <IconChevronLeft />
                          </IconButton>
                          <span className="PrototypeBoardPage__fullscreenCounter shrink-0 font-mono text-xs tabular-nums text-muted">
                            {expandedFrameIndex + 1} /{' '}
                            {orderedPreviewFrames.length}
                          </span>
                          <IconButton
                            size="xs"
                            variant="subtle"
                            label="Next frame (→)"
                            disabled={!nextPreviewFrame}
                            onClick={() =>
                              handleStepPreviewFrame(nextPreviewFrame)
                            }
                          >
                            <IconChevronRight />
                          </IconButton>
                          <div className="mx-1 h-4 w-px shrink-0 bg-border" />
                        </>
                      )}
                      <div className="min-w-0 truncate text-sm font-semibold text-strong">
                        {expandedFrame.title}
                      </div>
                    </div>

                    <div
                      role="group"
                      aria-label="Preview viewport"
                      className="PrototypeBoardPage__fullscreenViewports hidden shrink-0 items-center gap-0.5 sm:flex"
                    >
                      <IconButton
                        size="xs"
                        variant="subtle"
                        label="Desktop"
                        pressed={previewViewport === 'desktop'}
                        className="aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text"
                        onClick={() => setPreviewViewport('desktop')}
                      >
                        <IconDeviceDesktop />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="subtle"
                        label="Tablet (768px)"
                        pressed={previewViewport === 'tablet'}
                        className="aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text"
                        onClick={() => setPreviewViewport('tablet')}
                      >
                        <IconDeviceTablet />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="subtle"
                        label="Mobile (390px)"
                        pressed={previewViewport === 'mobile'}
                        className="aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-soft-text"
                        onClick={() => setPreviewViewport('mobile')}
                      >
                        <IconDeviceMobile />
                      </IconButton>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        size="xs"
                        variant="subtle"
                        label="Copy link to frame"
                        onClick={() => handleCopyFrameLink(expandedFrame.id)}
                      >
                        <IconLink />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="subtle"
                        href={expandedPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        label="Open preview in new tab"
                      >
                        <IconExternalLink />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="subtle"
                        label="Exit full screen"
                        tooltip={false}
                        onClick={() => setExpandedFrameId(null)}
                      >
                        <IconX />
                      </IconButton>
                    </div>
                  </div>
                  <div className="PrototypeBoardPage__fullscreenStage flex min-h-0 flex-1 justify-center overflow-hidden bg-page">
                    <iframe
                      src={expandedPreviewUrl}
                      sandbox="allow-scripts"
                      title={expandedFrame.title}
                      style={{width: previewWidth, maxWidth: '100%'}}
                      className={cn(
                        'block h-full min-h-0 border-0 bg-surface',
                        previewViewport !== 'desktop' &&
                          'border-x border-border shadow-sm'
                      )}
                    />
                  </div>
                </>
              )}
            </Dialog>
          );
        })()}
      </div>
    </Layout>
  );
}
