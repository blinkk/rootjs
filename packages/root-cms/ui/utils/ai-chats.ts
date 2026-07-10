/**
 * Browser-side chat history store for the Root AI chat (`/cms/ai`).
 *
 * Chat history now lives entirely client-side: the browser reads and writes
 * `Projects/{projectId}/AiChats/{chatId}` directly with the signed-in user's
 * Firebase credentials (the same way it writes draft docs). This replaces the
 * old server-side `ChatStore` + `/cms/api/ai.chats.*` endpoints.
 *
 * NOTE: the project's Firestore security rules must allow a user to read and
 * write their own chat documents under `Projects/{projectId}/AiChats` (matched
 * on the `createdBy` field). If the rules disallow it, persistence degrades
 * gracefully — the live chat still works, it just isn't saved.
 */
import {generateText, type UIMessage} from 'ai';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  resolveLanguageModel,
  withBrowserHeaders,
  type SerializedClientModel,
} from '../../shared/ai/models.js';
import {
  buildTitlePrompt,
  buildTitlePromptContext,
  deriveChatTitle,
  sanitizeGeneratedTitle,
  stripUndefined,
  TITLE_GENERATION_SYSTEM_PROMPT,
} from '../../shared/ai/prompt-utils.js';

export interface ChatSummary {
  id: string;
  title?: string;
  modelId?: string;
  createdAt: number;
  modifiedAt: number;
}

export interface StoredChat extends ChatSummary {
  messages: UIMessage[];
}

/** Upper bound on chats read in a single `listChats` call. */
const MAX_CHATS_READ = 500;

function db() {
  return window.firebase.db;
}

function projectId(): string {
  return window.__ROOT_CTX.rootConfig.projectId;
}

function userEmail(): string {
  return window.firebase.user?.email || '';
}

function chatsCollectionRef() {
  return collection(db(), 'Projects', projectId(), 'AiChats');
}

function chatDocRef(id: string) {
  return doc(db(), 'Projects', projectId(), 'AiChats', id);
}

function toMillis(value: any): number {
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return typeof value === 'number' ? value : 0;
}

/** Lists the current user's recent chats, most recently modified first. */
export async function listChats(options?: {
  limit?: number;
}): Promise<ChatSummary[]> {
  const email = userEmail();
  if (!email) {
    return [];
  }
  const rawLimit = options?.limit;
  const max =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 100)
      : 50;
  // Sort client-side to avoid requiring a Firestore composite index on
  // (createdBy, modifiedAt). Bound the read so a user with many chats can't
  // turn a single call into a huge read.
  const q = query(
    chatsCollectionRef(),
    where('createdBy', '==', email),
    fbLimit(MAX_CHATS_READ)
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => d.data() as any);
  records.sort((a, b) => toMillis(b.modifiedAt) - toMillis(a.modifiedAt));
  return records.slice(0, max).map((r) => ({
    id: r.id,
    title: r.title,
    modelId: r.modelId,
    createdAt: toMillis(r.createdAt),
    modifiedAt: toMillis(r.modifiedAt),
  }));
}

/** Returns a chat owned by the current user, or `null`. */
export async function getChat(id: string): Promise<StoredChat | null> {
  const snap = await getDoc(chatDocRef(id));
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data() as any;
  if (data.createdBy !== userEmail()) {
    return null;
  }
  return {
    id: data.id || id,
    title: data.title,
    modelId: data.modelId,
    createdAt: toMillis(data.createdAt),
    modifiedAt: toMillis(data.modifiedAt),
    messages: (data.messages || []) as UIMessage[],
  };
}

/**
 * Creates or updates a chat document. Refuses to overwrite a doc owned by a
 * different user (Firestore rules are the real gate; this is defense in depth).
 */
export async function saveChat(
  id: string,
  options: {messages: UIMessage[]; modelId?: string; title?: string}
): Promise<void> {
  const email = userEmail();
  const ref = chatDocRef(id);
  const existing = await getDoc(ref);
  if (existing.exists() && (existing.data() as any).createdBy !== email) {
    throw new Error('chat is owned by another user');
  }
  const update: Record<string, any> = {
    id,
    createdBy: email,
    modifiedAt: serverTimestamp(),
    // Firestore rejects `undefined`, but the AI SDK frequently produces
    // messages with `metadata: undefined`. Strip them before persisting.
    messages: stripUndefined(options.messages),
  };
  if (!existing.exists()) {
    update.createdAt = serverTimestamp();
  }
  if (options.modelId) {
    update.modelId = options.modelId;
  }
  if (options.title) {
    update.title = options.title;
  }
  await setDoc(ref, update, {merge: true});
}

/** Deletes a chat owned by the current user. */
export async function deleteChat(id: string): Promise<void> {
  const existing = await getChat(id);
  if (!existing) {
    return;
  }
  await deleteDoc(chatDocRef(id));
}

/**
 * Generates a short summary title for a chat using the selected model, run
 * directly from the browser. Falls back to `deriveChatTitle` on failure.
 */
export async function generateChatTitle(
  model: SerializedClientModel,
  messages: UIMessage[]
): Promise<string> {
  const fallback = deriveChatTitle(messages);
  if (fallback === 'New chat') {
    return fallback;
  }
  const context = buildTitlePromptContext(messages);
  if (!context) {
    return fallback;
  }
  try {
    const languageModel = resolveLanguageModel(withBrowserHeaders(model));
    const result = await generateText({
      model: languageModel,
      system: TITLE_GENERATION_SYSTEM_PROMPT,
      prompt: buildTitlePrompt(context),
      maxOutputTokens: 96,
      temperature: 0.3,
    });
    const title = sanitizeGeneratedTitle(result.text);
    if (title) {
      return title;
    }
  } catch (err) {
    console.error('failed to generate chat title:', err);
  }
  return fallback;
}
