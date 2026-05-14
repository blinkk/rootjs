/**
 * Entry point for the mock LLM server.
 *
 * Resolves configuration (CLI flags > environment variables > the values in
 * `mock.config.js`), starts the OpenAI-compatible HTTP server, and prints the
 * `baseURL` to wire into an `openai-compatible` model config.
 *
 * Usage:
 *   node src/index.js [--port <port>] [--config <path>]
 *
 * Environment variables:
 *   PORT          Overrides the listen port.
 *   MOCK_CONFIG   Path to the mock config module (defaults to ../mock.config.js).
 */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createServer} from './server.js';

/** Fallback port, used when none is set via flag, env var, or config. */
const DEFAULT_PORT = 8765;

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Parses `--key value` and `--key=value` style flags from an argv slice. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[arg.slice(2)] = next;
      i++;
    } else {
      args[arg.slice(2)] = true;
    }
  }
  return args;
}

/** Dynamically imports the mock config module at `configPath`. */
async function loadConfig(configPath) {
  const mod = await import(pathToFileURL(configPath).href);
  const config = mod.default || mod;
  if (!config || typeof config !== 'object') {
    throw new Error(`mock config at ${configPath} must export a config object`);
  }
  return config;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(
    args.config ||
      process.env.MOCK_CONFIG ||
      path.join(dirname, '..', 'mock.config.js')
  );

  let config;
  try {
    config = await loadConfig(configPath);
  } catch (err) {
    console.error(`[mock-localllm] failed to load config from ${configPath}`);
    console.error(err);
    process.exit(1);
    return;
  }

  const port = Number(
    args.port || process.env.PORT || config.port || DEFAULT_PORT
  );
  const server = createServer(config);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[mock-localllm] port ${port} is already in use.`);
    } else {
      console.error('[mock-localllm] server error:', err);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    const ruleCount = Array.isArray(config.rules) ? config.rules.length : 0;
    console.log('[mock-localllm] mock OpenAI-compatible LLM server running');
    console.log(`[mock-localllm]   url:     http://localhost:${port}`);
    console.log(`[mock-localllm]   baseURL: http://localhost:${port}/v1`);
    console.log(`[mock-localllm]   config:  ${configPath}`);
    console.log(`[mock-localllm]   rules:   ${ruleCount}`);
  });

  const shutdown = () => {
    console.log('\n[mock-localllm] shutting down');
    server.close(() => process.exit(0));
    // Force-exit if connections linger (e.g. an open SSE stream).
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
