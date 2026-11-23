import './PrototypeBoardPage.css';

import {IconExternalLink, IconX} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation, useRoute} from 'preact-iso';
import type {
  CanvasCamera,
  PrototypeAnnotation,
  PrototypeAnnotationKind,
  PrototypeBlockRect,
  PrototypeCommentThread,
} from '../../../../../shared/prototypes.js';
import {
  fitCameraToBounds,
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
import {isEditableTarget} from '../../../../utils/keyboard.js';
import {errorMessage} from '../../../../utils/notifications.js';
import {autokey} from '../../../../utils/rand.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {testCanEdit} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
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
import {takeInitialPrototypePrompt} from '../../prototypes-client.js';
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

/**
 * Full-bleed infinite canvas workspace for `/cms/prototypes/:boardId`.
 * Orchestrates the floating top bar, infinite dot-grid artboard, sandboxed
 * frames, bottom tool/zoom dock, floating Comments card & pin popovers, and
 * floating Root AI assistant card.
 */
export function PrototypeBoardPage(props: PrototypeBoardPageProps) {
  const {params} = useRoute();
  const {query, route} = useLocation();
  const boardId = props.boardId || params.boardId || '';

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
    deleteAnnotation,
    applyFrameMutated,
    applyAnnotationMutated,
    applyComponentMutated,
    refreshAfterAiTurn,
    setBoardAiChatId,
  } = usePrototypeBoard(boardId);

  const {roles} = useProjectRoles();
  const currentUserEmail = (window.firebase?.user?.email || '').toLowerCase();
  const canEdit = useMemo(
    () => testCanEdit(roles, currentUserEmail),
    [roles, currentUserEmail]
  );
  // Root AI only edits the board, so it is offered to editing roles only.
  const aiAvailable = testAiEnabled() && canEdit;

  usePageTitle(
    bundle?.board.title ? `${bundle.board.title} · Prototypes` : 'Prototypes'
  );

  const [activePageId, setActivePageId] = useState<string>(
    () => (query.page as string) || ''
  );
  const [camera, setCamera] = useState<CanvasCamera>({
    x: 80,
    y: 80,
    zoom: 0.65,
  });
  const [tool, setTool] = useState<PrototypeCanvasTool>('select');
  const [spacePressed, setSpacePressed] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null
  );
  // A just-placed annotation that is not saved until it has text.
  const [draftAnnotation, setDraftAnnotation] =
    useState<PrototypeAnnotation | null>(null);
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const modals = useModals();
  const [activePanel, setActivePanel] = useState<PrototypeSidePanel>(null);
  const [aiFocusKey, setAiFocusKey] = useState(0);
  const [queuedPrompt, setQueuedPrompt] = useState<{
    id: string | number;
    text: string;
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

  // Sync active page once the board loads (respecting `?page=` when valid).
  useEffect(() => {
    if (!bundle) {
      return;
    }
    const pages = bundle.board.pages;
    if (pages.length === 0) {
      return;
    }
    const queryPage = query.page as string | undefined;
    if (queryPage && pages.some((page) => page.id === queryPage)) {
      setActivePageId(queryPage);
      return;
    }
    if (!activePageId || !pages.some((page) => page.id === activePageId)) {
      setActivePageId(pages[0].id);
    }
  }, [bundle?.board.id, bundle?.board.pages.length]);

  // Auto-open Root AI and queue the prompt entered in NewPrototypeModal, once.
  useEffect(() => {
    if (initialPromptHandledRef.current || !bundle || !aiAvailable) {
      return;
    }
    initialPromptHandledRef.current = true;
    const initialPrompt = takeInitialPrototypePrompt(bundle.board.id);
    if (initialPrompt) {
      setActivePanel('ai');
      setQueuedPrompt({id: Date.now(), text: initialPrompt});
    }
  }, [bundle, aiAvailable]);

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

  // Selecting a frame or block deselects any annotation (and vice versa, in
  // `handleSelectAnnotation`).
  useEffect(() => {
    if (selectedFrameId) {
      setSelectedAnnotationId(null);
    }
  }, [selectedFrameId]);

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
      setCamera(fitCameraToBounds(boxes, vw, vh, 96));
    },
    [pageFrames, pageAnnotations]
  );

  const aiGenerating = aiAvailable && (aiStreaming || Boolean(queuedPrompt));

  // Fit frames to viewport on initial board load, when switching pages, and as
  // Root AI populates an initially empty page with side-by-side variants.
  useEffect(() => {
    if (!bundle || !activePage.id) {
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
    activePage.id,
    pageFrames,
    aiGenerating,
    fitActivePageToScreen,
  ]);

  const handleSelectPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setSelectedFrameId(null);
    setSelectedBlockKey(null);
    setSelectedAnnotationId(null);
    setEditingAnnotationId(null);
    setDraftAnnotation(null);
    setPinPopover(null);
    lastAutoFitCountRef.current = 0;
    userMovedCameraRef.current = false;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('page', pageId);
    window.history.replaceState(null, '', nextUrl.pathname + nextUrl.search);
  }, []);

  const handleOpenFramePreview = useCallback(
    (frameId: string) => {
      const previewUrl = `/cms/prototypes-preview/${encodeURIComponent(boardId)}/${encodeURIComponent(frameId)}`;
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    },
    [boardId]
  );

  const handleEditFrameWithAi = useCallback((frameId: string) => {
    setSelectedFrameId(frameId);
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
      setSelectedFrameId(created.id);
      setSelectedBlockKey(null);
      // Pan camera smoothly to center on the newly created frame.
      const el = viewportElRef.current;
      const vw = el?.clientWidth || window.innerWidth || 1280;
      const vh = el?.clientHeight || window.innerHeight || 800;
      setCamera(
        fitCameraToBounds(
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
        )
      );
    } catch (err) {
      showNotification({
        title: 'Could not create frame',
        message: errorMessage(err),
        color: 'red',
      });
    }
  }, [canEdit, bundle, createFrame, activePage.id]);

  const handleSelectAnnotation = useCallback((annotationId: string) => {
    setSelectedAnnotationId(annotationId);
    setSelectedFrameId(null);
    setSelectedBlockKey(null);
    setPinPopover(null);
  }, []);

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

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      setSelectedAnnotationId((prev) => (prev === annotationId ? null : prev));
      deleteAnnotation(annotationId).catch((err) => {
        showNotification({
          title: 'Could not delete annotation',
          message: errorMessage(err),
          color: 'red',
        });
      });
    },
    [deleteAnnotation]
  );

  const handleCommitAnnotation = useCallback(
    (annotationId: string, text: string) => {
      setEditingAnnotationId((prev) => (prev === annotationId ? null : prev));
      const trimmed = text.trim();
      if (draftAnnotation?.id === annotationId) {
        setDraftAnnotation(null);
        if (!trimmed) {
          setSelectedAnnotationId((prev) =>
            prev === annotationId ? null : prev
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
        handleDeleteAnnotation(annotationId);
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
      handleDeleteAnnotation,
    ]
  );

  const handleCancelAnnotationEdit = useCallback(
    (annotationId: string) => {
      setEditingAnnotationId((prev) => (prev === annotationId ? null : prev));
      if (draftAnnotation?.id === annotationId) {
        setDraftAnnotation(null);
        setSelectedAnnotationId(null);
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

  const handleZoomBy = useCallback((factor: number) => {
    const el = viewportElRef.current;
    const cx = (el?.clientWidth || window.innerWidth || 1280) / 2;
    const cy = (el?.clientHeight || window.innerHeight || 800) / 2;
    setCamera((prev) =>
      zoomCameraAroundPoint(prev, prev.zoom * factor, cx, cy)
    );
  }, []);

  // Single-key canvas shortcuts (V, H, F, C, N, T, Space, Escape, Delete, 0,
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
      if (e.key === 'Escape') {
        if (pinPopover) {
          setPinPopover(null);
          return;
        }
        if (tool !== 'select') {
          setTool('select');
          return;
        }
        setSelectedAnnotationId(null);
        setSelectedBlockKey(null);
        setSelectedFrameId(null);
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
        if (canEdit && selectedAnnotationId) {
          e.preventDefault();
          handleDeleteAnnotation(selectedAnnotationId);
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
        handleZoomBy(ZOOM_STEP_FACTOR);
      } else if (key === '-') {
        e.preventDefault();
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
    selectedAnnotationId,
    handleDeleteAnnotation,
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
      const chosenId = targetFrameId || selectedFrameId;
      const chosenFrame = chosenId
        ? pageFrames.find((frame) => frame.id === chosenId) ||
          bundle.frames.find((frame) => frame.id === chosenId)
        : null;
      const framesToExport = chosenFrame ? [chosenFrame] : pageFrames;
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
    [bundle, selectedFrameId, pageFrames, activePage.name]
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
        setSelectedFrameId(frame.id);
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
          activePanel={activePanel}
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
          selectedBlockKey={selectedBlockKey}
          openThreads={openPageThreads}
          activeThreadId={pinPopover?.threadId || null}
          canEdit={canEdit}
          currentUserEmail={currentUserEmail}
          aiAvailable={aiAvailable}
          aiGenerating={aiGenerating}
          sidePanelOpen={activePanel !== null}
          onViewportElement={(el) => {
            viewportElRef.current = el;
          }}
          annotations={pageAnnotations}
          selectedAnnotationId={selectedAnnotationId}
          editingAnnotationId={editingAnnotationId}
          onCreateAnnotation={handleCreateAnnotation}
          onSelectAnnotation={handleSelectAnnotation}
          onEditAnnotation={(annotationId) => {
            handleSelectAnnotation(annotationId);
            setEditingAnnotationId(annotationId);
          }}
          onCommitAnnotation={handleCommitAnnotation}
          onCancelAnnotationEdit={handleCancelAnnotationEdit}
          onDragAnnotation={handleDragAnnotation}
          onSelect={(frameId, blockKey) => {
            setSelectedFrameId(frameId);
            setSelectedBlockKey(blockKey);
            setSelectedAnnotationId(null);
            if (!frameId) {
              setPinPopover(null);
            }
          }}
          onExpandFrame={(frameId) => setExpandedFrameId(frameId)}
          onOpenPreview={handleOpenFramePreview}
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
                  setSelectedFrameId(created.id);
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
                if (selectedFrameId === frameId) {
                  setSelectedFrameId(null);
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
        {activePanel === 'comments' && (
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
        {activePanel === 'ai' && aiAvailable && (
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
                setSelectedFrameId(null);
                setSelectedBlockKey(null);
              }
            }}
            onFrameMutated={(frame) => {
              applyFrameMutated(frame);
              if (frame.pageId === activePage.id) {
                setSelectedFrameId(frame.id);
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
          const expandedFrame = expandedFrameId
            ? bundle.frames.find((frame) => frame.id === expandedFrameId) ||
              null
            : null;
          const expandedPreviewUrl = expandedFrame
            ? `/cms/prototypes-preview/${encodeURIComponent(boardId)}/${encodeURIComponent(expandedFrame.id)}`
            : '';
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
                    <div className="min-w-0 truncate text-sm font-semibold text-strong">
                      {expandedFrame.title}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
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
                  <iframe
                    src={expandedPreviewUrl}
                    sandbox="allow-scripts"
                    title={expandedFrame.title}
                    className="block min-h-0 w-full flex-1 border-0 bg-surface"
                  />
                </>
              )}
            </Dialog>
          );
        })()}
      </div>
    </Layout>
  );
}
