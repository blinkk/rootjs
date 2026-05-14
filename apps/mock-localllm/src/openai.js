/**
 * Builders for OpenAI-compatible Chat Completions payloads.
 *
 * The mock server only speaks the slice of the OpenAI API that the Vercel AI
 * SDK's `openai-compatible` provider relies on: the `POST /v1/chat/completions`
 * endpoint, in both buffered (JSON) and streamed (SSE) forms. These helpers are
 * pure — they build plain objects and leave all I/O to the server.
 */
import crypto from 'node:crypto';

/** Generates a unique completion id, matching OpenAI's `chatcmpl-` prefix. */
export function createCompletionId() {
  return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Produces a rough token estimate used to populate the `usage` field. This is
 * deliberately approximate (~4 characters per token); it only needs to be
 * plausible enough for UI that displays token counts.
 */
export function estimateTokens(text) {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(String(text).length / 4));
}

/**
 * Builds a buffered (non-streaming) `chat.completion` response object.
 *
 * @param {object} options
 * @param {string} options.id Completion id from `createCompletionId()`.
 * @param {string} options.model Model id echoed back to the client.
 * @param {string} options.content Full assistant message text.
 * @param {string} options.promptText User prompt text, used for token counts.
 */
export function buildCompletion(options) {
  const {id, model, content, promptText} = options;
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(content);
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {role: 'assistant', content},
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

/**
 * Builds a single `chat.completion.chunk` object for a streamed response.
 *
 * @param {object} options
 * @param {string} options.id Completion id, shared across every chunk.
 * @param {string} options.model Model id echoed back to the client.
 * @param {object} options.delta Partial message delta (e.g. `{content: 'hi'}`).
 * @param {string | null} [options.finishReason] Set to `'stop'` on the final chunk.
 */
export function buildChunk(options) {
  const {id, model, delta, finishReason = null} = options;
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: delta || {},
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * Builds the trailing usage-only chunk. OpenAI emits this (with an empty
 * `choices` array) just before `[DONE]` when the request sets
 * `stream_options.include_usage`.
 *
 * @param {object} options
 * @param {string} options.id Completion id, shared across every chunk.
 * @param {string} options.model Model id echoed back to the client.
 * @param {string} options.promptText User prompt text, used for token counts.
 * @param {string} options.content Full assistant message text.
 */
export function buildUsageChunk(options) {
  const {id, model, promptText, content} = options;
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(content);
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}
