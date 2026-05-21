/**
 * Prompt extraction and rule matching for the mock LLM server.
 *
 * The server pulls the latest user message out of an OpenAI-style request and
 * runs it past the user-defined `rules` in `mock.config.js`. A matched rule
 * resolves to a single assistant "turn" — text, tool calls, or both — which
 * the server then delivers in buffered or streamed form.
 *
 * Tool-call loops are supported via a rule's `responses` array: the server
 * picks the entry matching how many assistant turns have happened since the
 * last user message, so turn 0 can request a tool call and turn 1 can answer
 * once the client sends the tool result back.
 */
import {createToolCallId} from './openai.js';

/**
 * Extracts the text of the most recent `user` message from an OpenAI-style
 * `messages` array. Handles both the plain-string `content` form and the
 * multimodal content-parts array form, ignoring non-text parts (e.g. images).
 *
 * Returns an empty string when there is no user message.
 */
export function extractPrompt(messages) {
  if (!Array.isArray(messages)) {
    return '';
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'user') {
      return contentToText(message.content);
    }
  }
  return '';
}

/** Flattens OpenAI message `content` (a string or content-parts array) to plain text. */
function contentToText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (part) => part && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join(' ')
      .trim();
  }
  return '';
}

/**
 * Counts the assistant messages that appear after the last `user` message.
 * This is the current tool-call loop depth: it is 0 for a fresh user prompt
 * and increments by one each time the model replies and the client sends tool
 * results back. It is used to index into a rule's `responses` array.
 */
export function resolveTurnIndex(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') {
      lastUser = i;
      break;
    }
  }
  let count = 0;
  for (let i = lastUser + 1; i < messages.length; i++) {
    if (messages[i] && messages[i].role === 'assistant') {
      count++;
    }
  }
  return count;
}

/**
 * @typedef {object} NormalizedToolCall
 * @property {string} id Tool-call id (generated when the config omits one).
 * @property {string} name Function name to call.
 * @property {string} arguments JSON-encoded argument string.
 */

/**
 * @typedef {object} MatchResult
 * @property {string} promptText The latest user prompt text.
 * @property {string[]} text Assistant message text, as ordered stream chunks.
 * @property {NormalizedToolCall[]} toolCalls Tool calls to emit this turn.
 * @property {{min: number, max: number} | number | undefined} delay Effective inter-chunk delay.
 * @property {number} ruleIndex Index of the matched rule, or `-1` for the fallback.
 * @property {number} turnIndex Tool-call loop depth used to pick the turn.
 */

/**
 * Matches an incoming request against the configured rules and resolves the
 * assistant turn to deliver. Falls back to `config.fallback` when no rule
 * matches.
 *
 * @returns {MatchResult}
 */
export function matchRule(config, messages) {
  const promptText = extractPrompt(messages);
  const turnIndex = resolveTurnIndex(messages);
  const rules = Array.isArray(config.rules) ? config.rules : [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (ruleMatches(rule, promptText)) {
      const normalized = normalizeTurn(selectTurn(rule, turnIndex));
      return {
        promptText,
        text: normalized.text,
        toolCalls: normalized.toolCalls,
        delay: rule.delay ?? config.delay,
        ruleIndex: i,
        turnIndex,
      };
    }
  }
  const normalized = normalizeTurn(config.fallback);
  return {
    promptText,
    text: normalized.text,
    toolCalls: normalized.toolCalls,
    delay: config.delay,
    ruleIndex: -1,
    turnIndex,
  };
}

/**
 * Picks the turn a rule should reply with. A rule using `responses` (a
 * multi-turn array, for tool-call loops) is indexed by `turnIndex`, clamped to
 * the last entry. A rule using the single `response` field always replies with
 * that value.
 */
function selectTurn(rule, turnIndex) {
  if (Array.isArray(rule.responses) && rule.responses.length > 0) {
    const index = Math.min(turnIndex, rule.responses.length - 1);
    return rule.responses[index];
  }
  return rule.response;
}

/**
 * Tests a single rule against the prompt text. A RegExp `prompt` is tested
 * directly; a string `prompt` is compared per the rule's `match` strategy
 * (`'includes'` by default), case-insensitively.
 */
function ruleMatches(rule, promptText) {
  if (!rule || rule.prompt === undefined || rule.prompt === null) {
    return false;
  }
  const {prompt} = rule;
  if (prompt instanceof RegExp) {
    return prompt.test(promptText);
  }
  const haystack = promptText.toLowerCase();
  const needle = String(prompt).toLowerCase().trim();
  switch (rule.match || 'includes') {
    case 'exact':
      return haystack.trim() === needle;
    case 'startsWith':
      return haystack.trimStart().startsWith(needle);
    case 'regex':
      return new RegExp(String(prompt), 'i').test(promptText);
    case 'includes':
    default:
      return haystack.includes(needle);
  }
}

/**
 * Normalizes a turn value into `{text, toolCalls}`. A turn may be a string, an
 * array of strings, or an object with `text` and/or `toolCalls`.
 *
 * @returns {{text: string[], toolCalls: NormalizedToolCall[]}}
 */
export function normalizeTurn(turn) {
  if (turn === undefined || turn === null) {
    return {text: [], toolCalls: []};
  }
  if (typeof turn === 'string' || Array.isArray(turn)) {
    return {text: normalizeText(turn), toolCalls: []};
  }
  if (typeof turn === 'object') {
    return {
      text: normalizeText(turn.text),
      toolCalls: normalizeToolCalls(turn.toolCalls),
    };
  }
  return {text: [String(turn)], toolCalls: []};
}

/** Normalizes turn text (a string, string array, or undefined) into stream chunks. */
function normalizeText(text) {
  if (Array.isArray(text)) {
    return text.map((part) => String(part));
  }
  if (typeof text === 'string') {
    return [text];
  }
  return [];
}

/**
 * Normalizes a config tool-call list into wire-ready tool calls: each gets a
 * generated id when one is not supplied, and object arguments are JSON-encoded
 * (string arguments pass through as-is). Entries without a `name` are dropped.
 */
function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  const out = [];
  for (const toolCall of toolCalls) {
    if (!toolCall || !toolCall.name) {
      continue;
    }
    out.push({
      id: toolCall.id || createToolCallId(),
      name: String(toolCall.name),
      arguments:
        typeof toolCall.arguments === 'string'
          ? toolCall.arguments
          : JSON.stringify(toolCall.arguments ?? {}),
    });
  }
  return out;
}
