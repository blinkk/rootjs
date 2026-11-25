/**
 * Typed browser client for `/cms/api/prototypes.*` endpoints.
 */

import type {
  PrototypeAiChatSession,
  PrototypeAnnotation,
  PrototypeBoard,
  PrototypeBoardBundle,
  PrototypeBoardPage,
  PrototypeBoardStatus,
  PrototypeBoardSummary,
  PrototypeCommentAnchor,
  PrototypeCommentThread,
  PrototypeComponentSpec,
  PrototypeFrame,
  PrototypeProjectContext,
  PrototypeTheme,
} from '../../../shared/prototypes.js';
import type {ClientTurnConfig} from '../ai/components/RootAIChat/clientChatTransport.js';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Human-readable explanation, when the server has one. */
  message?: string;
}

async function postJson<T>(
  endpoint: string,
  body: Record<string, unknown> = {},
  init?: {keepalive?: boolean}
): Promise<T> {
  const res = await window.fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    ...(init?.keepalive ? {keepalive: true} : {}),
  });
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Handled below using HTTP status.
  }
  if (!res.ok || !payload?.success) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `Request to ${endpoint} failed (${res.status})`
    );
  }
  return payload.data as T;
}

/** Lists all prototype boards on the current project. */
export async function apiListPrototypeBoards(options?: {
  status?: PrototypeBoardStatus | 'all';
}): Promise<PrototypeBoardSummary[]> {
  return postJson<PrototypeBoardSummary[]>('/cms/api/prototypes.list', {
    status: options?.status ?? 'all',
  });
}

/** Loads the full bundle (board, frames, components, comments) for `boardId`. */
export async function apiGetPrototypeBoard(
  boardId: string
): Promise<PrototypeBoardBundle> {
  return postJson<PrototypeBoardBundle>('/cms/api/prototypes.get', {boardId});
}

/** Creates a new prototype board and returns its hydrated bundle. */
export async function apiCreatePrototypeBoard(input: {
  title: string;
  description?: string;
  initialPrompt?: string;
}): Promise<PrototypeBoardBundle> {
  return postJson<PrototypeBoardBundle>('/cms/api/prototypes.create', input);
}

/** Updates board metadata (title, description, status, pages, theme, aiChatId). */
export async function apiUpdatePrototypeBoard(input: {
  boardId: string;
  title?: string;
  description?: string;
  status?: PrototypeBoardStatus;
  pages?: PrototypeBoardPage[];
  theme?: PrototypeTheme;
  aiChatId?: string;
}): Promise<PrototypeBoard> {
  return postJson<PrototypeBoard>('/cms/api/prototypes.update', input);
}

/** Duplicates an existing prototype board (including frames and component specs). */
export async function apiDuplicatePrototypeBoard(input: {
  boardId: string;
  title?: string;
}): Promise<PrototypeBoardSummary> {
  return postJson<PrototypeBoardSummary>(
    '/cms/api/prototypes.duplicate',
    input
  );
}

/** Permanently deletes a prototype board and its subcollections. */
export async function apiDeletePrototypeBoard(boardId: string): Promise<void> {
  await postJson<{deleted: boolean}>('/cms/api/prototypes.delete', {boardId});
}

/** Loads read-only project schema summaries, extracted tokens, and source excerpts. */
export async function apiGetPrototypeContext(options?: {
  componentNames?: string[];
}): Promise<PrototypeProjectContext> {
  return postJson<PrototypeProjectContext>('/cms/api/prototypes.context', {
    componentNames: options?.componentNames,
  });
}

/** Creates or updates a single frame on a prototype board. */
export async function apiSavePrototypeFrame(input: {
  boardId: string;
  frame: Partial<PrototypeFrame> & {id: string};
}): Promise<PrototypeFrame> {
  return postJson<PrototypeFrame>('/cms/api/prototypes.frame.save', input);
}

/** Deletes a frame from a prototype board. */
export async function apiDeletePrototypeFrame(input: {
  boardId: string;
  frameId: string;
}): Promise<void> {
  await postJson<{deleted: boolean}>('/cms/api/prototypes.frame.delete', input);
}

/** Creates or updates a note or text label on a prototype board. */
export async function apiSavePrototypeAnnotation(input: {
  boardId: string;
  annotation: Partial<PrototypeAnnotation> & {id: string};
}): Promise<PrototypeAnnotation> {
  return postJson<PrototypeAnnotation>(
    '/cms/api/prototypes.annotation.save',
    input
  );
}

/** Deletes a note or text label from a prototype board. */
export async function apiDeletePrototypeAnnotation(input: {
  boardId: string;
  annotationId: string;
}): Promise<void> {
  await postJson<{deleted: boolean}>(
    '/cms/api/prototypes.annotation.delete',
    input
  );
}

/** Batch-moves multiple frames and/or annotations on a prototype board. */
export async function apiMovePrototypeItems(input: {
  boardId: string;
  frames?: Array<{id: string; x: number; y: number}>;
  annotations?: Array<{id: string; x: number; y: number}>;
}): Promise<{movedFrames: number; movedAnnotations: number}> {
  return postJson<{movedFrames: number; movedAnnotations: number}>(
    '/cms/api/prototypes.items.move',
    input
  );
}

/** Saves a reusable component spec (either project Visual Twin or board Proposed spec). */
export async function apiSavePrototypeComponent(input: {
  boardId: string;
  spec: Omit<PrototypeComponentSpec, 'updatedAt' | 'updatedBy'>;
}): Promise<PrototypeComponentSpec> {
  return postJson<PrototypeComponentSpec>(
    '/cms/api/prototypes.component.save',
    input
  );
}

/** Adds a comment to an existing thread or starts a new anchored thread. */
export async function apiAddPrototypeComment(input: {
  boardId: string;
  threadId?: string;
  anchor?: PrototypeCommentAnchor;
  anchorLabel?: string;
  body: string;
  content: string;
  mentions?: string[];
}): Promise<PrototypeCommentThread> {
  return postJson<PrototypeCommentThread>(
    '/cms/api/prototypes.comment.add',
    input
  );
}

/** Resolves or reopens a prototype comment thread. */
export async function apiSetPrototypeCommentStatus(input: {
  boardId: string;
  threadId: string;
  status: 'open' | 'resolved';
}): Promise<PrototypeCommentThread> {
  return postJson<PrototypeCommentThread>(
    '/cms/api/prototypes.comment.status',
    input
  );
}

/** Moves a comment thread's pin anchor to new frame, block, or canvas coordinates. */
export async function apiMovePrototypeComment(input: {
  boardId: string;
  threadId: string;
  anchor: PrototypeCommentAnchor;
  anchorLabel?: string;
}): Promise<PrototypeCommentThread> {
  return postJson<PrototypeCommentThread>(
    '/cms/api/prototypes.comment.move',
    input
  );
}

/** Deletes a comment item (or thread if it was the first comment). */
export async function apiDeletePrototypeComment(input: {
  boardId: string;
  threadId: string;
  commentId: string;
}): Promise<{deleted: boolean}> {
  return postJson<{deleted: boolean}>(
    '/cms/api/prototypes.comment.delete',
    input
  );
}

/** Prepares a browser-streamed AI turn for the prototype board assistant. */
export async function apiPreparePrototypeAiTurn(input: {
  boardId: string;
  modelId?: string;
  selectedFrameId?: string | null;
  selectedBlockKey?: string | null;
}): Promise<ClientTurnConfig> {
  return postJson<ClientTurnConfig>('/cms/api/prototypes.ai.prepare', input);
}

/** Loads the signed-in user's persisted Root AI chat session for `boardId`. */
export async function apiGetPrototypeAiChat(
  boardId: string
): Promise<{session: PrototypeAiChatSession | null}> {
  return postJson<{session: PrototypeAiChatSession | null}>(
    '/cms/api/prototypes.chat.get',
    {boardId}
  );
}

/** Saves the signed-in user's active Root AI chat session for `boardId`. */
export async function apiSavePrototypeAiChat(
  input: {
    boardId: string;
    chatId: string;
    modelId?: string;
    messages: unknown[];
  },
  options?: {keepalive?: boolean}
): Promise<{session: PrototypeAiChatSession}> {
  return postJson<{session: PrototypeAiChatSession}>(
    '/cms/api/prototypes.chat.save',
    input,
    options
  );
}

/** Clears the signed-in user's active Root AI chat session for `boardId`. */
export async function apiClearPrototypeAiChat(
  boardId: string
): Promise<{cleared: boolean}> {
  return postJson<{cleared: boolean}>('/cms/api/prototypes.chat.clear', {
    boardId,
  });
}

/** Session storage key holding the initial AI prompt for a new board. */
function initialPromptKey(boardId: string): string {
  return `root-cms:prototype-initial-prompt:${boardId}`;
}

/**
 * Hands the creation-time prompt to the board page. Kept in session storage
 * rather than the URL so a shared or crafted link can never start an AI turn.
 */
export function storeInitialPrototypePrompt(boardId: string, prompt: string) {
  try {
    window.sessionStorage.setItem(initialPromptKey(boardId), prompt);
  } catch {
    // Storage unavailable; the board opens without an initial prompt.
  }
}

/** Reads and clears the creation-time prompt for a board, if any. */
export function takeInitialPrototypePrompt(boardId: string): string {
  try {
    const key = initialPromptKey(boardId);
    const prompt = window.sessionStorage.getItem(key) || '';
    window.sessionStorage.removeItem(key);
    return prompt.trim();
  } catch {
    return '';
  }
}
