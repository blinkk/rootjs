/**
 * OpenAI-compatible HTTP server for the mock LLM.
 *
 * Implements just enough of the OpenAI API for the Vercel AI SDK's
 * `openai-compatible` provider and other OpenAI-style clients:
 *  - `POST /v1/chat/completions` — buffered and streamed chat completions,
 *    including assistant tool calls.
 *  - `GET  /v1/models` — lists the mock model ids.
 *  - `GET  /` — a small health/info payload for manual checks.
 *
 * Responses are driven entirely by the user-supplied `mock.config.js`: a
 * matched rule resolves to an assistant turn that may contain text and/or tool
 * calls. Text given as an array of strings is streamed chunk-by-chunk with a
 * randomized inter-chunk delay, so streaming UI can be exercised without a
 * real model.
 *
 * The endpoints are also accepted without the `/v1` prefix so the server works
 * regardless of whether the configured `baseURL` includes it.
 */
import http from 'node:http';
import {matchRule} from './matcher.js';
import {
  buildChunk,
  buildCompletion,
  buildUsageChunk,
  createCompletionId,
  toolCallArgsDelta,
  toolCallOpenDelta,
} from './openai.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Maximum accepted request body size, as a guard against a runaway client. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Pauses for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves a delay config to a concrete millisecond value. The config may be a
 * fixed number, a `{min, max}` range (re-rolled on every call so streamed
 * chunks arrive at varying intervals), or undefined (no delay).
 */
function resolveDelayMs(delay) {
  if (typeof delay === 'number' && delay >= 0) {
    return delay;
  }
  if (delay && typeof delay === 'object') {
    const min = Number(delay.min) || 0;
    const max = Number(delay.max) || min;
    if (max <= min) {
      return min;
    }
    return Math.floor(min + Math.random() * (max - min));
  }
  return 0;
}

/** Sends a JSON response with CORS headers. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body, null, 2));
}

/** Sends an OpenAI-shaped error response. */
function sendError(res, status, message, type = 'invalid_request_error') {
  sendJson(res, status, {error: {message, type}});
}

/** Reads and JSON-parses the full request body, rejecting on invalid input. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

/** Truncates a prompt for single-line logging. */
function previewText(text) {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 60 ? `${collapsed.slice(0, 57)}...` : collapsed;
}

/** Handles `POST /v1/chat/completions`, in both buffered and streamed modes. */
async function handleChatCompletions(req, res, config) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message);
    return;
  }

  const modelId =
    body.model || (config.models && config.models[0]) || 'mock-llm';
  const {promptText, text, toolCalls, delay, ruleIndex, turnIndex} = matchRule(
    config,
    body.messages
  );
  const fullText = text.join('');
  const stream = body.stream === true;
  const includeUsage = Boolean(
    body.stream_options && body.stream_options.include_usage
  );
  const id = createCompletionId();

  const ruleLabel = ruleIndex >= 0 ? `rule #${ruleIndex}` : 'fallback';
  const toolLabel =
    toolCalls.length > 0
      ? ` tools=${toolCalls.map((toolCall) => toolCall.name).join(',')}`
      : '';
  console.log(
    `[mock-localllm] chat.completions ${stream ? 'stream' : 'buffered'} ` +
      `model=${modelId} match=${ruleLabel} turn=${turnIndex}${toolLabel} ` +
      `prompt=${JSON.stringify(previewText(promptText))}`
  );

  if (!stream) {
    sendJson(
      res,
      200,
      buildCompletion({
        id,
        model: modelId,
        content: fullText,
        promptText,
        toolCalls,
      })
    );
    return;
  }

  // Streamed Server-Sent Events response.
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // The client may hang up mid-stream (e.g. the user stops a generation); stop
  // emitting chunks and clear any pending delay timer when that happens.
  let aborted = false;
  const onClose = () => {
    aborted = true;
  };
  res.on('close', onClose);

  const writeChunk = (chunk) => {
    if (aborted || res.writableEnded) {
      return;
    }
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  // Pauses for the configured inter-chunk delay, if any.
  const pause = async () => {
    const ms = resolveDelayMs(delay);
    if (ms > 0) {
      await sleep(ms);
    }
  };

  try {
    // The opening chunk announces the assistant role, like the real API.
    writeChunk(
      buildChunk({id, model: modelId, delta: {role: 'assistant', content: ''}})
    );
    // Stream the message text, one configured chunk at a time.
    for (const part of text) {
      if (aborted) {
        break;
      }
      await pause();
      writeChunk(buildChunk({id, model: modelId, delta: {content: part}}));
    }
    // Stream any tool calls: an opening delta (id + name) then the arguments.
    for (let i = 0; i < toolCalls.length; i++) {
      if (aborted) {
        break;
      }
      const toolCall = toolCalls[i];
      await pause();
      writeChunk(
        buildChunk({id, model: modelId, delta: toolCallOpenDelta(i, toolCall)})
      );
      if (aborted) {
        break;
      }
      await pause();
      writeChunk(
        buildChunk({
          id,
          model: modelId,
          delta: toolCallArgsDelta(i, toolCall.arguments),
        })
      );
    }
    if (!aborted) {
      const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
      writeChunk(buildChunk({id, model: modelId, delta: {}, finishReason}));
      if (includeUsage) {
        writeChunk(
          buildUsageChunk({
            id,
            model: modelId,
            promptText,
            content: fullText,
            toolCalls,
          })
        );
      }
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
      }
    }
  } finally {
    res.off('close', onClose);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/** Handles `GET /v1/models`, listing the configured mock model ids. */
function handleModels(res, config) {
  const ids =
    Array.isArray(config.models) && config.models.length > 0
      ? config.models
      : ['mock-llm'];
  const created = Math.floor(Date.now() / 1000);
  sendJson(res, 200, {
    object: 'list',
    data: ids.map((id) => ({
      id,
      object: 'model',
      created,
      owned_by: 'mock-localllm',
    })),
  });
}

/** Handles `GET /` — a small status payload useful for manual checks. */
function handleHealth(res, config) {
  sendJson(res, 200, {
    name: 'mock-localllm',
    status: 'ok',
    models: config.models || ['mock-llm'],
    rules: Array.isArray(config.rules) ? config.rules.length : 0,
    endpoints: ['POST /v1/chat/completions', 'GET /v1/models'],
  });
}

/**
 * Creates (but does not start) the mock LLM HTTP server for the given config.
 * Call `.listen(port)` on the returned server to start it.
 */
export function createServer(config) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (
      req.method === 'POST' &&
      (pathname === '/v1/chat/completions' || pathname === '/chat/completions')
    ) {
      handleChatCompletions(req, res, config).catch((err) => {
        console.error('[mock-localllm] request failed:', err);
        if (!res.headersSent) {
          sendError(res, 500, 'internal mock server error', 'server_error');
        } else if (!res.writableEnded) {
          res.end();
        }
      });
      return;
    }

    if (
      req.method === 'GET' &&
      (pathname === '/v1/models' || pathname === '/models')
    ) {
      handleModels(res, config);
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      handleHealth(res, config);
      return;
    }

    console.warn(`[mock-localllm] 404 ${req.method} ${pathname}`);
    sendError(
      res,
      404,
      `no mock route for ${req.method} ${pathname}`,
      'not_found'
    );
  });
}
