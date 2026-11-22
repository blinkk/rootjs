/**
 * Typed browser client for `/cms/api/prototypes.*` endpoints.
 */

import type {
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
  PrototypeTurnSnapshot,
} from '../../../shared/prototypes.js';
import type {ClientTurnConfig} from '../ai/components/RootAIChat/clientChatTransport.js';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function postJson<T>(
  endpoint: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const res = await window.fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Handled below using HTTP status.
  }
  if (!res.ok || !payload?.success) {
    throw new Error(
      payload?.error || `Request to ${endpoint} failed (${res.status})`
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

/** Loads the full bundle (board, frames, components, comments, turns) for `boardId`. */
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

/** Records a reversible AI mutation turn snapshot. */
export async function apiSavePrototypeTurn(input: {
  boardId: string;
  turn: Omit<PrototypeTurnSnapshot, 'createdAt' | 'createdBy'>;
}): Promise<PrototypeTurnSnapshot> {
  return postJson<PrototypeTurnSnapshot>(
    '/cms/api/prototypes.turn.save',
    input
  );
}

/** Toggles revert/restore of an AI mutation turn snapshot. */
export async function apiRevertPrototypeTurn(input: {
  boardId: string;
  turnId: string;
  restore?: boolean;
}): Promise<{reverted: boolean}> {
  return postJson<{reverted: boolean}>(
    '/cms/api/prototypes.turn.revert',
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
