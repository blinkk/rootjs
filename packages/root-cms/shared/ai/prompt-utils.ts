/**
 * Pure, browser-safe helpers for the Root AI chat: deriving/sanitizing chat
 * titles, healing abandoned tool calls, and stripping `undefined` before
 * persisting to Firestore.
 *
 * These were previously defined in `core/ai.ts` (server-only). They moved here
 * so the browser can reuse them now that the `/cms/ai` chat streams directly
 * from the client. `core/ai.ts` re-exports them for back-compat and tests.
 *
 * Keep this module free of Node-only and `firebase-admin` imports.
 */
import type {UIMessage} from 'ai';

/** Derives a short title from the first user message (used as fallback). */
export function deriveChatTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) {
    return 'New chat';
  }
  const text = first.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join(' ')
    .trim();
  if (!text) {
    return 'New chat';
  }
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Extracts the first user turn and first assistant text turn as a plain-text
 * transcript, suitable for the title-generation prompt. Skips tool-call
 * parts, reasoning chunks, and attachments so the model sees the
 * conversational substance and nothing else.
 *
 * Only the opening exchange is included on purpose — the chat title should
 * describe what the conversation is *about*, anchored on the user's initial
 * ask, not drift as later follow-ups arrive.
 */
export function buildTitlePromptContext(messages: UIMessage[]): string {
  const lines: string[] = [];
  let haveUser = false;
  let haveAssistant = false;
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') {
      continue;
    }
    if (m.role === 'user' && haveUser) {
      continue;
    }
    if (m.role === 'assistant' && haveAssistant) {
      continue;
    }
    const text = (m.parts || [])
      .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) {
      continue;
    }
    // Cap each side so a long pasted blob can't blow the prompt budget; the
    // opening few hundred chars are more than enough to capture the topic.
    const truncated = text.length > 800 ? `${text.slice(0, 800)}…` : text;
    lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${truncated}`);
    if (m.role === 'user') {
      haveUser = true;
    } else {
      haveAssistant = true;
    }
    if (haveUser && haveAssistant) {
      break;
    }
  }
  return lines.join('\n\n');
}

/**
 * Strips the cruft LLMs commonly emit around a title — leading "Title:"
 * preamble, surrounding quotes, trailing punctuation, internal newlines —
 * and enforces a hard length cap.
 */
export function sanitizeGeneratedTitle(raw: string): string {
  let title = (raw || '').trim();
  if (!title) {
    return '';
  }
  // Keep only the first non-empty line — some models add a one-line title
  // followed by a justification paragraph.
  const firstLine = title.split(/\r?\n/).find((l) => l.trim().length > 0);
  title = (firstLine || '').trim();
  // Drop a "Title:"/"Chat title:"/"Topic:" prefix.
  title = title.replace(/^\s*(?:chat\s+)?(?:title|topic)\s*[:\-—]\s*/i, '');
  // Strip wrapping quotes (straight + smart) and any markdown emphasis.
  title = title.replace(/^[\s"'“”‘’`*_]+|[\s"'“”‘’`*_]+$/g, '');
  // Drop trailing sentence punctuation.
  title = title.replace(/[.!?,;:]+$/g, '').trim();
  // Collapse any remaining internal whitespace.
  title = title.replace(/\s+/g, ' ');
  if (!title) {
    return '';
  }
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

/** System prompt used to generate a short summary title for a chat. */
export const TITLE_GENERATION_SYSTEM_PROMPT = [
  'You write short, descriptive titles for chat conversations in a',
  'CMS admin tool. A user has just opened a new chat. Read the',
  'opening exchange and produce a title that summarizes what the',
  'conversation is about.',
  '',
  'Rules:',
  '- Output ONLY the title text. No quotes, no trailing punctuation,',
  '  no "Title:" prefix, no markdown.',
  '- 5 to 10 words. Hard cap of 60 characters.',
  '- Use a noun phrase in Sentence case (e.g. "Translate homepage',
  '  hero copy", "Debug image upload error", "Draft blog post about',
  '  pricing").',
  "- Describe the user's task or topic. Do NOT echo the user's",
  '  message verbatim and do NOT start with a verb like "How to" or',
  '  a question word.',
  '- If the user wrote in a non-English language, write the title in',
  '  the same language.',
  '- Do not include emoji.',
].join('\n');

/** Builds the user prompt for title generation from the opening exchange. */
export function buildTitlePrompt(context: string): string {
  return ['Opening exchange:', '', context, '', 'Title:'].join('\n');
}

/**
 * Tool-call part states that mean a result has not arrived yet. A persisted
 * chat can end on one of these if a turn was abandoned mid-approval: the
 * assistant message is saved before the client-side write tool resolves, so
 * the call is stored without an output.
 */
const UNRESOLVED_TOOL_STATES = new Set(['input-streaming', 'input-available']);

/** True if a UIMessage part is a tool call (static `tool-<name>` or dynamic). */
function isToolCallPart(part: any): boolean {
  return (
    !!part &&
    typeof part.type === 'string' &&
    (part.type.startsWith('tool-') || part.type === 'dynamic-tool')
  );
}

/**
 * Synthesizes an aborted result for any tool-call part still awaiting one, so
 * every `tool_use` keeps a matching `tool_result` when the history is handed
 * to the model. Left unresolved, such parts (from an abandoned turn) make the
 * provider reject the next request. Returns the original array unchanged when
 * there is nothing to repair.
 */
export function sanitizeDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  let changed = false;
  const result = messages.map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.parts)) {
      return message;
    }
    let partsChanged = false;
    const parts = message.parts.map((part: any) => {
      if (isToolCallPart(part) && UNRESOLVED_TOOL_STATES.has(part.state)) {
        partsChanged = true;
        return {
          ...part,
          state: 'output-available',
          output: {
            success: false,
            error: 'ABORTED',
            message:
              'This tool call never completed because the chat turn was ' +
              'abandoned before it ran. Do not assume it succeeded; ask the ' +
              'user before retrying.',
          },
        };
      }
      return part;
    });
    if (!partsChanged) {
      return message;
    }
    changed = true;
    return {...message, parts};
  });
  return changed ? result : messages;
}

/**
 * Merges the latest incoming message into a persisted chat history. Replaces a
 * matched entry (and drops anything after it) so message ids stay unique and
 * tool-call/result pairing stays intact; a genuinely new id is appended.
 */
export function mergeIncomingMessage(
  stored: UIMessage[],
  incoming: UIMessage
): UIMessage[] {
  const idx = stored.findIndex((m) => m.id === incoming.id);
  if (idx === -1) {
    return [...stored, incoming];
  }
  return [...stored.slice(0, idx), incoming];
}

/**
 * Recursively removes `undefined` values from an object/array. Returns a new
 * structure; the input is not mutated. Used to clean payloads before sending
 * them to Firestore, which rejects `undefined` outright.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) {
        continue;
      }
      out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Extracts JSON from an AI response that may contain markdown code blocks.
 */
export function extractJsonFromResponse(responseText: string): string {
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    const lines = jsonText.split('\n');
    jsonText = lines.slice(1, -1).join('\n');
    if (jsonText.startsWith('json')) {
      jsonText = jsonText.substring(4).trim();
    }
  }
  return jsonText;
}
