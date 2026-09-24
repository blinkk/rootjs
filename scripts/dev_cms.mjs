/**
 * Starts the CMS dev watcher and the docs Root dev server together, and ties
 * their lifetimes so neither outlives the other.
 *
 * Each child runs in its own process group so that its entire process tree
 * (pnpm, concurrently, esbuild, tsc, etc.) can be killed at once when either
 * side exits or this script is stopped (ctrl+c, ctrl+d, a crash, SIGTERM,
 * etc.). Signaling only the direct child is not enough, since the pnpm
 * wrappers in between don't forward signals to their descendants.
 */

import {spawn} from 'node:child_process';
import {constants} from 'node:os';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

// Delay before starting the docs server so the CMS watcher can build first.
const DOCS_START_DELAY_MS = 2000;

const children = [];
let exiting = false;

startChild('CMS dev watcher', ['--filter=@blinkk/root-cms', 'run', 'dev'], {
  stdin: 'ignore',
});
const docsTimer = setTimeout(() => {
  startChild('docs dev server', ['--filter=@private/docs', 'run', 'dev'], {
    stdin: 'inherit',
  });
}, DOCS_START_DELAY_MS);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => shutdown(exitCode(null, signal)));
}
process.on('exit', () => killChildren());

/** Spawns `pnpm <args>` in a new process group and tracks it. */
function startChild(name, args, options) {
  const child = spawn('pnpm', args, {
    cwd: rootDir,
    detached: true,
    stdio: [options.stdin, 'inherit', 'inherit'],
  });
  child.on('exit', (code, signal) => {
    if (!exiting) {
      console.log(`[cms:dev] ${name} exited, shutting down.`);
      shutdown(exitCode(code, signal));
    }
  });
  children.push(child);
}

/** Stops all children and exits with the given code. */
function shutdown(code) {
  if (exiting) {
    return;
  }
  exiting = true;
  clearTimeout(docsTimer);
  killChildren();
  process.exit(code);
}

/** Kills each child's entire process group. */
function killChildren() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // The process group has already exited.
    }
  }
}

/** Converts a child's exit info into a shell-style exit code. */
function exitCode(code, signal) {
  return code ?? 128 + (constants.signals[signal] || 0);
}
