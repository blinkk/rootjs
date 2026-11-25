/**
 * Browser storage helpers for prototype board tab-scoped camera state and
 * per-user Root AI chat/panel session persistence.
 */

import {
  type CanvasCamera,
  clampCanvasZoom,
  type PrototypeAiChatSession,
} from '../../../shared/prototypes.js';
import type {PrototypeSidePanel} from './components/PrototypeTopBar/PrototypeTopBar.js';

/** Tab-scoped state persisted in `sessionStorage` for a prototype board. */
export interface PrototypeTabState {
  /** Last active page id viewed in this tab. */
  activePageId?: string;
  /** Persisted pan/scroll (`x`, `y`) and `zoom` keyed by `pageId`. */
  camerasByPage: Record<string, CanvasCamera>;
  /** Frame id most recently synced to `?frame=` by this tab, if any. */
  urlFrameId?: string | null;
  /** Open right-hand side panel (`comments`, `ai`, or `null`) in this tab. */
  activePanel?: PrototypeSidePanel;
}

/** Per-user Root AI composer and panel UI state persisted in `localStorage`. */
export interface PrototypeAiUiState {
  /** Whether the user left the Root AI panel open on this board. */
  panelOpen?: boolean;
  /** Unsent composer prompt text on this board. */
  draftText?: string;
}

function getProjectKey(): string {
  if (typeof window === 'undefined') {
    return 'default';
  }
  return window.__ROOT_CTX?.rootConfig?.projectId || 'default';
}

function getUserKey(): string {
  if (typeof window === 'undefined') {
    return 'anonymous';
  }
  return (window.firebase?.user?.email || 'anonymous').trim().toLowerCase();
}

function tabStateStorageKey(boardId: string): string {
  return `root-cms:prototype-tab-state:${getProjectKey()}:${boardId}`;
}

function aiUiStorageKey(boardId: string): string {
  return `root-cms:prototype-ai-ui:${getProjectKey()}:${getUserKey()}:${boardId}`;
}

function aiChatCacheStorageKey(boardId: string): string {
  return `root-cms:prototype-ai-chat:${getProjectKey()}:${getUserKey()}:${boardId}`;
}

function sanitizeCamera(raw: unknown): CanvasCamera | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.x !== 'number' ||
    !Number.isFinite(obj.x) ||
    typeof obj.y !== 'number' ||
    !Number.isFinite(obj.y) ||
    typeof obj.zoom !== 'number' ||
    !Number.isFinite(obj.zoom)
  ) {
    return null;
  }
  return {
    x: obj.x,
    y: obj.y,
    zoom: clampCanvasZoom(obj.zoom),
  };
}

/** Reads the tab-scoped camera and page state for `boardId` from `sessionStorage`. */
export function readPrototypeTabState(
  boardId: string
): PrototypeTabState | null {
  if (typeof window === 'undefined' || !boardId) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(tabStateStorageKey(boardId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const camerasByPage: Record<string, CanvasCamera> = {};
    if (parsed.camerasByPage && typeof parsed.camerasByPage === 'object') {
      for (const [pageId, cam] of Object.entries(
        parsed.camerasByPage as Record<string, unknown>
      )) {
        const valid = sanitizeCamera(cam);
        if (valid) {
          camerasByPage[pageId] = valid;
        }
      }
    }
    const activePanel =
      parsed.activePanel === 'comments' ||
      parsed.activePanel === 'ai' ||
      parsed.activePanel === null
        ? parsed.activePanel
        : undefined;
    return {
      activePageId:
        typeof parsed.activePageId === 'string'
          ? parsed.activePageId
          : undefined,
      camerasByPage,
      urlFrameId:
        typeof parsed.urlFrameId === 'string' || parsed.urlFrameId === null
          ? parsed.urlFrameId
          : undefined,
      activePanel,
    };
  } catch {
    return null;
  }
}

/** Writes the tab-scoped camera and page state for `boardId` to `sessionStorage`. */
export function writePrototypeTabState(
  boardId: string,
  state: PrototypeTabState
): void {
  if (typeof window === 'undefined' || !boardId) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      tabStateStorageKey(boardId),
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

/** Reads the per-user Root AI panel/draft UI state for `boardId`. */
export function readPrototypeAiUiState(
  boardId: string
): PrototypeAiUiState | null {
  if (typeof window === 'undefined' || !boardId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(aiUiStorageKey(boardId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      panelOpen:
        typeof parsed.panelOpen === 'boolean' ? parsed.panelOpen : undefined,
      draftText:
        typeof parsed.draftText === 'string' ? parsed.draftText : undefined,
    };
  } catch {
    return null;
  }
}

/** Merges and persists per-user Root AI panel/draft UI state for `boardId`. */
export function writePrototypeAiUiState(
  boardId: string,
  patch: Partial<PrototypeAiUiState>
): void {
  if (typeof window === 'undefined' || !boardId) {
    return;
  }
  try {
    const prev = readPrototypeAiUiState(boardId) || {};
    const next: PrototypeAiUiState = {...prev, ...patch};
    window.localStorage.setItem(aiUiStorageKey(boardId), JSON.stringify(next));
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

/** Reads the cached per-user Root AI chat session for `boardId`, if any. */
export function readCachedPrototypeAiSession(
  boardId: string
): PrototypeAiChatSession | null {
  if (typeof window === 'undefined' || !boardId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(aiChatCacheStorageKey(boardId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.chatId !== 'string' ||
      !parsed.chatId ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }
    return {
      chatId: parsed.chatId,
      ...(typeof parsed.modelId === 'string' && parsed.modelId
        ? {modelId: parsed.modelId}
        : {}),
      messages: parsed.messages,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Writes the per-user Root AI chat session cache for `boardId`. */
export function writeCachedPrototypeAiSession(
  boardId: string,
  session: PrototypeAiChatSession
): void {
  if (typeof window === 'undefined' || !boardId) {
    return;
  }
  try {
    window.localStorage.setItem(
      aiChatCacheStorageKey(boardId),
      JSON.stringify(session)
    );
  } catch {
    // Ignore localStorage quota errors (the server copy remains authoritative).
  }
}

/** Clears the cached per-user Root AI chat session for `boardId`. */
export function clearCachedPrototypeAiSession(boardId: string): void {
  if (typeof window === 'undefined' || !boardId) {
    return;
  }
  try {
    window.localStorage.removeItem(aiChatCacheStorageKey(boardId));
  } catch {
    // Ignore storage errors.
  }
}
