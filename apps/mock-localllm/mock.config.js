/**
 * Mock LLM configuration.
 *
 * Edit this file to control how the mock server responds. Each incoming chat
 * request is matched against `rules` from top to bottom (first match wins); if
 * nothing matches, `fallback` is used.
 *
 * A `response` may be either:
 *   - a string         — delivered as a single chunk, or
 *   - an array of strings — streamed back one element at a time, with a random
 *     delay between chunks (see `delay`) to imitate real token streaming.
 *
 * Restart the server after editing to pick up changes. You can also point the
 * server at a different file with `--config <path>` or the `MOCK_CONFIG` env
 * var.
 */

/** @typedef {{min: number, max: number} | number} Delay */

/**
 * @typedef {object} MockRule
 * @property {string | RegExp} prompt Text or pattern matched against the latest user message.
 * @property {'includes' | 'exact' | 'startsWith' | 'regex'} [match] How a string `prompt` is compared (default `'includes'`, case-insensitive). Ignored for RegExp prompts.
 * @property {string | string[]} response The mock reply. An array is streamed chunk-by-chunk.
 * @property {Delay} [delay] Optional per-rule override of the inter-chunk streaming delay.
 */

/**
 * @typedef {object} MockConfig
 * @property {number} [port] Default listen port. Overridden by `--port` or the `PORT` env var.
 * @property {string[]} [models] Model ids advertised by `GET /v1/models`.
 * @property {Delay} [delay] Delay between streamed chunks, in milliseconds.
 * @property {string | string[]} fallback Response used when no rule matches.
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
  ],
};
