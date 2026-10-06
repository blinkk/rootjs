import crypto from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {threadId} from 'node:worker_threads';
import {Timestamp} from 'firebase-admin/firestore';
import type {RootCMSReadCache} from './read-cache.js';

/** How often to check whether another thread has finished a fetch. */
const LOCK_POLL_INTERVAL_MS = 20;

/**
 * Locks older than this are assumed to belong to a thread that crashed, so
 * they're removed and the read is fetched again.
 */
const LOCK_STALE_MS = 60 * 1000;

/** Key used to serialize `Timestamp` values, e.g. `{"$ts": [secs, nanos]}`. */
const TIMESTAMP_KEY = '$ts';

/**
 * Options for a `FileReadCache`.
 */
export interface FileReadCacheOptions {
  /** Directory to store cached reads in. */
  dir: string;

  /**
   * How long (in ms) a cached read is served before it's fetched again.
   * Defaults to 1 hour.
   */
  ttl?: number;
}

/**
 * Returns the directory `createRoute()` uses to cache published reads during
 * SSG builds. The cms plugin clears it at the start of every build.
 */
export function getSsgReadCacheDir(rootDir: string) {
  return path.join(rootDir, 'node_modules', '.cache', 'root-cms', 'ssg-reads');
}

/**
 * A cache for published CMS reads that's stored on the filesystem, so that it
 * can be shared by every thread (and process) of a build, e.g. the worker
 * threads of `root build --threads`. `createRoute({cache: true})` uses one for
 * SSG builds.
 *
 * Each read is stored in its own file, which is written atomically (to a temp
 * file that's then renamed). When a read isn't cached, the first thread to
 * create the read's lock file fetches it and the other threads wait for its
 * result, so each read is fetched once per build.
 */
export class FileReadCache implements RootCMSReadCache {
  readonly dir: string;
  private readonly ttl: number;
  /** Reads in flight in this thread, keyed by cache key. */
  private readonly pending = new Map<string, Promise<CachedRead>>();

  constructor(options: FileReadCacheOptions) {
    this.dir = options.dir;
    this.ttl = options.ttl ?? 60 * 60 * 1000;
  }

  /**
   * Returns the cached value for `key`, or calls `fetch()` and caches its
   * result. Concurrent reads for the same key (from any thread) share one
   * fetch, and failed fetches aren't cached. Each caller gets its own copy of
   * the value.
   */
  async get<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.load(key, fetch).finally(() => {
        this.pending.delete(key);
      });
      this.pending.set(key, pending);
    }
    const result = await pending;
    if (result.text !== undefined) {
      return deserialize(result.text) as T;
    }
    return result.value as T;
  }

  /**
   * Removes all cached reads.
   */
  async clear() {
    await fs.rm(this.dir, {recursive: true, force: true});
  }

  private async load(
    key: string,
    fetch: () => Promise<unknown>
  ): Promise<CachedRead> {
    const hash = crypto.createHash('sha1').update(key).digest('hex');
    const filePath = path.join(this.dir, `${hash}.json`);
    const lockPath = `${filePath}.lock`;
    for (;;) {
      const cached = await this.readFile(filePath);
      if (cached !== undefined) {
        return {text: cached};
      }
      const lock = await acquireLock(lockPath);
      if (lock === 'busy') {
        // Another thread is fetching the read, wait for it to finish and then
        // check the cache again.
        await waitForUnlock(lockPath);
        continue;
      }
      try {
        // Another thread may have cached the read before the lock was
        // acquired.
        if (lock === 'locked') {
          const text = await this.readFile(filePath);
          if (text !== undefined) {
            return {text};
          }
        }
        const value = await fetch();
        const text = serialize(value);
        if (text !== undefined && lock === 'locked') {
          await this.writeFile(filePath, text);
        }
        return {text, value};
      } finally {
        if (lock === 'locked') {
          await fs.rm(lockPath, {force: true});
        }
      }
    }
  }

  /**
   * Returns the cached (serialized) value in `filePath`, or `undefined` if
   * it's missing or expired. Files start with the time they expire at,
   * followed by a newline and the serialized value.
   */
  private async readFile(filePath: string): Promise<string | undefined> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      if (isErrorCode(err, 'ENOENT')) {
        return undefined;
      }
      throw err;
    }
    const newline = content.indexOf('\n');
    const expiresAt = Number(content.slice(0, newline));
    if (newline === -1 || !(expiresAt > Date.now())) {
      return undefined;
    }
    return content.slice(newline + 1);
  }

  /**
   * Writes a file atomically, so that other threads never read a partially
   * written file. Write errors are logged and ignored, since the read is
   * still returned to the caller.
   */
  private async writeFile(filePath: string, text: string) {
    const expiresAt = Date.now() + this.ttl;
    const tmpPath = `${filePath}.${process.pid}-${threadId}-${crypto
      .randomBytes(4)
      .toString('hex')}.tmp`;
    try {
      await fs.writeFile(tmpPath, `${expiresAt}\n${text}`);
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      console.warn(`[root cms] failed to write ${filePath}: ${err}`);
      await fs.rm(tmpPath, {force: true});
    }
  }
}

interface CachedRead {
  /** The serialized value, or `undefined` if it can't be serialized. */
  text?: string;
  /** The fetched value. Only set by the thread that fetched it. */
  value?: unknown;
}

/**
 * Creates the lock file at `lockPath`. Returns "locked" if this thread now
 * holds the lock, "busy" if another thread holds it, or "unavailable" if the
 * lock can't be created (e.g. on a read-only filesystem), in which case the
 * read is fetched without caching it.
 */
async function acquireLock(
  lockPath: string
): Promise<'locked' | 'busy' | 'unavailable'> {
  try {
    await fs.mkdir(path.dirname(lockPath), {recursive: true});
    const handle = await fs.open(lockPath, 'wx');
    await handle.close();
    return 'locked';
  } catch (err) {
    if (isErrorCode(err, 'EEXIST')) {
      return 'busy';
    }
    console.warn(`[root cms] failed to create ${lockPath}: ${err}`);
    return 'unavailable';
  }
}

/**
 * Waits until the lock at `lockPath` is released. Stale locks (e.g. from a
 * thread that crashed) are removed.
 */
async function waitForUnlock(lockPath: string) {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    let stat;
    try {
      stat = await fs.stat(lockPath);
    } catch (err) {
      if (isErrorCode(err, 'ENOENT')) {
        return;
      }
      throw err;
    }
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
      await fs.rm(lockPath, {force: true});
      return;
    }
  }
}

/**
 * Serializes Firestore data to JSON, keeping `Timestamp` values. Returns
 * `undefined` if the data contains any other non-JSON values.
 */
function serialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, function (this: any, key: string) {
      // Use the original value, since `JSON.stringify()` calls `toJSON()` on
      // values before passing them to the replacer.
      const val = this[key];
      if (val instanceof Timestamp) {
        return {[TIMESTAMP_KEY]: [val.seconds, val.nanoseconds]};
      }
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const proto = Object.getPrototypeOf(val);
        if (proto !== Object.prototype && proto !== null) {
          throw new UnserializableError();
        }
      }
      return val;
    });
  } catch (err) {
    if (err instanceof UnserializableError) {
      return undefined;
    }
    throw err;
  }
}

function deserialize(text: string): unknown {
  return JSON.parse(text, (_key, val) => {
    if (
      typeof val === 'object' &&
      val !== null &&
      Array.isArray(val[TIMESTAMP_KEY]) &&
      Object.keys(val).length === 1
    ) {
      const [seconds, nanoseconds] = val[TIMESTAMP_KEY];
      return new Timestamp(seconds, nanoseconds);
    }
    return val;
  });
}

class UnserializableError extends Error {}

function isErrorCode(err: unknown, code: string) {
  return (err as NodeJS.ErrnoException)?.code === code;
}
