import os from 'node:os';
import path from 'node:path';

import {fileExists, loadJson, writeJson} from '../../utils/fsutils.js';
import {checkVersionTask} from './check-version.js';

export interface StartupTaskContext {
  /** Absolute path to the root project directory. */
  rootDir: string;
  /** Currently installed version of the `@blinkk/root` package. */
  version?: string;
}

export interface StartupTask {
  /**
   * Unique id for the task. Used as the persistence key for the last run time,
   * so it must remain stable across releases.
   */
  name: string;
  /**
   * Minimum time (in milliseconds) that must elapse between runs. When set, the
   * task is skipped if it last ran more recently than this interval. Omit to
   * run on every startup.
   */
  throttle?: number;
  /**
   * Optional predicate evaluated before the throttle check. When it returns
   * false the task is skipped entirely (and its throttle is left untouched).
   * Useful for opt-out flags, e.g. an env var that disables the task.
   */
  enabled?: (ctx: StartupTaskContext) => boolean;
  /**
   * Task logic. Thrown errors are swallowed by the runner so that a failing
   * startup task never prevents `root` commands from starting.
   */
  run: (ctx: StartupTaskContext) => Promise<void>;
}

/**
 * Registered startup tasks. Add new startup tasks to this list.
 */
const STARTUP_TASKS: StartupTask[] = [checkVersionTask];

const STATE_FILE = path.join(os.homedir(), '.root', 'startup-tasks.json');

interface StartupTasksState {
  /** Map of task name to last run time (ms since epoch). */
  lastRun: Record<string, number>;
}

/**
 * Runs all registered startup tasks, honoring each task's throttle interval.
 *
 * Tasks are best-effort: failures are swallowed and never block startup. The
 * last run time of each task is persisted to the user's home directory so that
 * throttled tasks (e.g. the version check) run at most once per interval across
 * separate `root` invocations.
 */
export async function runStartupTasks(ctx: StartupTaskContext): Promise<void> {
  try {
    const state = await readState();
    const now = Date.now();
    const dueTasks = STARTUP_TASKS.filter(
      (task) =>
        isEnabled(task, ctx) && isDue(task, state.lastRun[task.name], now)
    );
    if (dueTasks.length === 0) {
      return;
    }
    await Promise.all(
      dueTasks.map(async (task) => {
        try {
          await task.run(ctx);
        } catch {
          // Startup tasks are best-effort; ignore failures.
        }
        // Record the attempt regardless of outcome so a failing task (e.g. no
        // network) doesn't retry on every startup.
        state.lastRun[task.name] = Date.now();
      })
    );
    await writeState(state);
  } catch {
    // Never let startup tasks interfere with the command.
  }
}

function isEnabled(task: StartupTask, ctx: StartupTaskContext): boolean {
  return !task.enabled || task.enabled(ctx);
}

function isDue(
  task: StartupTask,
  lastRun: number | undefined,
  now: number
): boolean {
  if (!task.throttle || !lastRun) {
    return true;
  }
  return now - lastRun >= task.throttle;
}

async function readState(): Promise<StartupTasksState> {
  if (await fileExists(STATE_FILE)) {
    try {
      const state = await loadJson<Partial<StartupTasksState>>(STATE_FILE);
      return {lastRun: state.lastRun || {}};
    } catch {
      // Corrupt or unreadable state file; start fresh.
    }
  }
  return {lastRun: {}};
}

async function writeState(state: StartupTasksState): Promise<void> {
  try {
    await writeJson(STATE_FILE, state);
  } catch {
    // Ignore write failures (e.g. read-only home directory).
  }
}
