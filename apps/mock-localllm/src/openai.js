/**
 * Builders for OpenAI-compatible Chat Completions payloads.
 *
 * The mock server only speaks the slice of the OpenAI API that the Vercel AI
 * SDK's `openai-compatible` provider relies on: the `POST /v1/chat/completions`
 * endpoint, in both buffered (JSON) and streamed (SSE) forms, including
 * assistant tool calls. These helpers are pure — they build plain objects and
 * leave all I/O to the server.
 */
import crypto from 'node:crypto';

/** Generates a unique completion id, matching OpenAI's `chatcmpl-` prefix. */
export function createCompletionId() {
  return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
}

/** Generates a unique tool-call id, matching OpenAI's `call_` prefix. */
export function createToolCallId() {
  return `call_${crypto.randomBytes(12).toString('hex')}`;
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
 * Estimates the completion tokens for an assistant turn, accounting for both
 * the message text and any tool-call names and arguments.
 */
function estimateCompletionTokens(content, toolCalls) {
  let text = content || '';
  for (const toolCall of toolCalls || []) {
    text += toolCall.name + toolCall.arguments;
  }
  return estimateTokens(text);
}

/** Maps normalized tool calls to the OpenAI `message.tool_calls` array shape. */
function toToolCallsField(toolCalls) {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    type: 'function',
    function: {name: toolCall.name, arguments: toolCall.arguments},
  }));
}

/**
 * Builds a buffered (non-streaming) `chat.completion` response object. When
 * `toolCalls` is non-empty the assistant message carries a `tool_calls` array
 * and the choice's `finish_reason` becomes `'tool_calls'`.
 *
 * @param {object} options
 * @param {string} options.id Completion id from `createCompletionId()`.
 * @param {string} options.model Model id echoed back to the client.
 * @param {string} options.content Assistant message text (may be empty).
 * @param {string} options.promptText User prompt text, used for token counts.
 * @param {Array<{id: string, name: string, arguments: string}>} [options.toolCalls] Tool calls to emit.
 */
export function buildCompletion(options) {
  const {id, model, content, promptText, toolCalls = []} = options;
  const hasToolCalls = toolCalls.length > 0;
  const message = {role: 'assistant', content: content || null};
  if (hasToolCalls) {
    message.tool_calls = toToolCallsField(toolCalls);
  }
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateCompletionTokens(content, toolCalls);
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
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
 * @param {string | null} [options.finishReason] Set on the final chunk (`'stop'` or `'tool_calls'`).
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
 * Builds the streaming delta that opens a tool call, carrying its id and
 * function name with an empty argument string (the arguments follow in a
 * later delta, mirroring how the real API streams them).
 *
 * @param {number} index Position of the tool call within the turn.
 * @param {{id: string, name: string}} toolCall Normalized tool call.
 */
export function toolCallOpenDelta(index, toolCall) {
  return {
    tool_calls: [
      {
        index,
        id: toolCall.id,
        type: 'function',
        function: {name: toolCall.name, arguments: ''},
      },
    ],
  };
}

/**
 * Builds the streaming delta that carries a slice of a tool call's JSON
 * argument string. The mock sends the arguments in a single slice per call.
 *
 * @param {number} index Position of the tool call within the turn.
 * @param {string} argsSlice Portion of the JSON-encoded arguments.
 */
export function toolCallArgsDelta(index, argsSlice) {
  return {
    tool_calls: [{index, function: {arguments: argsSlice}}],
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
 * @param {string} options.content Assistant message text (may be empty).
 * @param {Array<{name: string, arguments: string}>} [options.toolCalls] Tool calls emitted this turn.
 */
export function buildUsageChunk(options) {
  const {id, model, promptText, content, toolCalls = []} = options;
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateCompletionTokens(content, toolCalls);
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
