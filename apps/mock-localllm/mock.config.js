/**
 * Mock LLM configuration.
 *
 * Edit this file to control how the mock server responds. Each incoming chat
 * request is matched against `rules` from top to bottom (first match wins); if
 * nothing matches, `fallback` is used.
 *
 * A rule replies with an assistant "turn", which may contain text, tool calls,
 * or both:
 *   - a string         — text, delivered as a single chunk;
 *   - an array of strings — text, streamed chunk-by-chunk with a random delay
 *     between chunks (see `delay`) to imitate real token streaming;
 *   - an object `{text, toolCalls}` — text and/or mocked tool calls.
 *
 * To mock a tool-call loop, use `responses` (plural): an array of turns indexed
 * by how many assistant turns have happened since the user's message. Turn 0
 * can request a tool call; once the client runs the tool and sends the result
 * back, the server advances to turn 1, and so on. The final turn should be
 * text so the loop terminates.
 *
 * Restart the server after editing to pick up changes. You can also point the
 * server at a different file with `--config <path>` or the `MOCK_CONFIG` env
 * var.
 */

/** @typedef {{min: number, max: number} | number} Delay */

/**
 * @typedef {object} MockToolCall
 * @property {string} name Function name the model "calls".
 * @property {object | string} [arguments] Call arguments — an object (JSON-encoded for you) or a pre-encoded JSON string.
 * @property {string} [id] Tool-call id. Auto-generated when omitted.
 */

/**
 * A single assistant turn. One of:
 *  - a string — text delivered as one chunk;
 *  - an array of strings — text streamed chunk-by-chunk;
 *  - an object with `text` (string or string array) and/or `toolCalls`.
 * @typedef {string | string[] | {text?: string | string[], toolCalls?: MockToolCall[]}} MockTurn
 */

/**
 * @typedef {object} MockRule
 * @property {string | RegExp} prompt Text or pattern matched against the latest user message.
 * @property {'includes' | 'exact' | 'startsWith' | 'regex'} [match] How a string `prompt` is compared (default `'includes'`, case-insensitive). Ignored for RegExp prompts.
 * @property {MockTurn} [response] Single-turn reply. Use this OR `responses`.
 * @property {MockTurn[]} [responses] Multi-turn replies for tool-call loops, indexed by the assistant-turn count since the user's message. The final turn should be text.
 * @property {Delay} [delay] Optional per-rule override of the inter-chunk streaming delay.
 */

/**
 * @typedef {object} MockConfig
 * @property {number} [port] Default listen port. Overridden by `--port` or the `PORT` env var.
 * @property {string[]} [models] Model ids advertised by `GET /v1/models`.
 * @property {Delay} [delay] Delay between streamed chunks, in milliseconds.
 * @property {MockTurn} fallback Reply used when no rule matches.
 * @property {MockRule[]} rules Ordered match rules; the first match wins.
 */

/** @type {MockConfig} */
export default {
  port: 8765,

  models: ['mock-llm'],

  // A random delay in this range (ms) is applied between streamed chunks.
  delay: {min: 40, max: 280},

  // Returned when no rule below matches the user's prompt.
  fallback: [
    'This is the mock LLM. ',
    'No rule matched your prompt — ',
    'edit `apps/mock-localllm/mock.config.js` to add one.',
  ],

  rules: [
    {
      // Case-insensitive substring match is the default strategy.
      prompt: 'hello',
      response: [
        'Hello there! ',
        'I am a mock LLM. ',
        'How can I help you today?',
      ],
    },
    {
      prompt: 'tell me a joke',
      response: [
        'Why do programmers prefer dark mode?\n\n',
        'Because light attracts bugs.',
      ],
    },
    {
      // Exact match against the whole (trimmed) user message.
      prompt: 'ping',
      match: 'exact',
      response: 'pong',
    },
    {
      // RegExp prompts are tested directly against the message text. Combined
      // with a longer array + delay, this is handy for exercising streaming UI.
      prompt: /\b(stream|loading|long)\b/i,
      response: [
        'Streaming ', 'this ', 'response ', 'one ', 'word ', 'at ', 'a ',
        'time ', 'so ', 'you ', 'can ', 'watch ', 'the ', 'UI ', 'update ',
        'incrementally.',
      ],
      delay: {min: 120, max: 400},
    },
    {
      // A response with markdown, for testing rich rendering.
      prompt: 'markdown',
      response: [
        '# Mock heading\n\n',
        'Some **bold** text and a list:\n\n',
        '- one\n',
        '- two\n',
        '- three\n\n',
        '```js\nconsole.log("hello from the mock LLM");\n```\n',
      ],
    },
    {
      // A mocked tool-call loop. Turn 0 emits a tool call; the client runs the
      // tool and sends the result back, then the server advances to turn 1.
      // `getWeather` is a generic example — swap in whatever tool name your UI
      // registers.
      prompt: 'weather',
      responses: [
        {
          text: 'Let me check the weather for you.\n\n',
          toolCalls: [
            {name: 'getWeather', arguments: {location: 'San Francisco, CA'}},
          ],
        },
        ['It is currently ', '68°F and sunny ', 'in San Francisco.'],
      ],
    },
    {
      // A tool-call loop that exercises a real Root CMS tool. When the "Local
      // LLM" model is configured with `capabilities.tools: true`, the CMS sends
      // its own tool definitions, so a mocked tool call must use one of those
      // tool names (e.g. `docs_search`, `collections_list`, `doc_get`). The CMS
      // runs `docs_search` server-side and sends the result back for turn 1.
      prompt: 'search the cms',
      responses: [
        {
          text: 'Searching the CMS for matching docs.\n\n',
          toolCalls: [
            {name: 'docs_search', arguments: {query: 'home', limit: 5}},
          ],
        },
        'Those are the top results from the CMS search above.',
      ],
    },
  ],
};
