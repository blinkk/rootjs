/**
 * Prompt extraction and rule matching for the mock LLM server.
 *
 * The server pulls the latest user message out of an OpenAI-style request and
 * runs it past the user-defined `rules` in `mock.config.js`, returning the
 * configured response (or the fallback) for the server to deliver.
 */

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
        (part) =>
          part && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join(' ')
      .trim();
  }
  return '';
}

/**
 * @typedef {object} MatchResult
 * @property {string | string[]} response The matched rule's response (or the fallback).
 * @property {{min: number, max: number} | number | undefined} delay Effective inter-chunk delay.
 * @property {number} ruleIndex Index of the matched rule, or `-1` for the fallback.
 */

/**
 * Finds the first rule whose `prompt` matches `promptText` and returns its
 * response plus the effective delay config. Falls back to `config.fallback`
 * when no rule matches.
 *
 * @returns {MatchResult}
 */
export function matchRule(config, promptText) {
  const rules = Array.isArray(config.rules) ? config.rules : [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (ruleMatches(rule, promptText)) {
      return {
        response: rule.response,
        delay: rule.delay ?? config.delay,
        ruleIndex: i,
      };
    }
  }
  return {
    response: config.fallback,
    delay: config.delay,
    ruleIndex: -1,
  };
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
