import crypto from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import type {ReadCacheStore, ReadCacheStoreEntry} from './read-cache.js';

/**
 * Options for a `FileSystemReadCacheStore`.
 */
export interface FileSystemReadCacheStoreOptions {
  /** Directory where cached reads are written. */
  dir: string;

  /**
   * How long (in ms) to wait for another process that's fetching the same
   * key before fetching it again. Defaults to 30 seconds.
   */
  lockTimeout?: number;

  /**
   * How often (in ms) to check whether another process has finished fetching
   * a key. Defaults to 20ms.
   */
  pollInterval?: number;
}

/**
 * A `ReadCacheStore` that writes cached reads to the filesystem, so that they
 * can be shared across processes and worker threads, e.g. the workers of a
 * `root build --threads=N` SSG build.
 *
 * Concurrent misses for the same key are deduped across processes: the
 * first process to miss claims the key with a lock file and fetches it, and
 * the others wait for the result.
 *
 * ```ts
 * const cache = new ReadCache({
 *   store: new FileSystemReadCacheStore({dir: 'dist/.cache/root-cms'}),
 * });
 * ```
 *
 * During `root build`, `createRoute({cache: true})` uses this store
 * automatically (under `dist/.cache/`, which is deleted at the start and end
 * of each build).
 */
export class FileSystemReadCacheStore implements ReadCacheStore {
  private readonly dir: string;
  private readonly lockTimeout: number;
  private readonly pollInterval: number;

  constructor(options: FileSystemReadCacheStoreOptions) {
    this.dir = options.dir;
    this.lockTimeout = options.lockTimeout ?? 30 * 1000;
    this.pollInterval = options.pollInterval ?? 20;
  }

  async get(key: string): Promise<ReadCacheStoreEntry | undefined> {
    const filePath = this.filePath(key);
    const lockPath = `${filePath}.lock`;
    const deadline = Date.now() + this.lockTimeout;
    for (;;) {
      const entry = await readEntry(filePath);
      if (entry && entry.expiresAt > Date.now()) {
        return entry;
      }
      // Claim the key so that other processes wait for this process to fetch
      // it (the lock is removed by `set()` or `delete()`).
      try {
        await fs.mkdir(this.dir, {recursive: true});
        await fs.writeFile(lockPath, '', {flag: 'wx'});
        return undefined;
      } catch (err: any) {
        if (err?.code !== 'EEXIST') {
          return undefined;
        }
      }
      // Another process is fetching the key. If it takes too long (e.g. the
      // process crashed), fetch it again.
      if (Date.now() > deadline) {
        return undefined;
      }
      await sleep(this.pollInterval);
    }
  }

  async set(key: string, entry: ReadCacheStoreEntry): Promise<void> {
    const filePath = this.filePath(key);
    await fs.mkdir(this.dir, {recursive: true});
    // Write to a temp file and rename it so that readers never see a
    // partially written file.
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(encodeData(entry)));
    await fs.rename(tmpPath, filePath);
    await fs.rm(`${filePath}.lock`, {force: true});
  }

  async delete(key: string): Promise<void> {
    const filePath = this.filePath(key);
    await fs.rm(filePath, {force: true});
    await fs.rm(`${filePath}.lock`, {force: true});
  }

  async clear(): Promise<void> {
    await fs.rm(this.dir, {recursive: true, force: true});
  }

  private filePath(key: string) {
    const hash = crypto.createHash('sha1').update(key).digest('hex');
    return path.join(this.dir, `${hash}.json`);
  }
}

async function readEntry(
  filePath: string
): Promise<ReadCacheStoreEntry | undefined> {
  try {
    const json = await fs.readFile(filePath, 'utf8');
    return decodeData(JSON.parse(json));
  } catch {
    return undefined;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Marker for `Timestamp` values in serialized data. */
const TIMESTAMP_TYPE = '__rootCmsTimestamp';

/**
 * Converts Firestore data to JSON-serializable data, preserving `Timestamp`
 * values.
 */
function encodeData(value: any): any {
  if (value instanceof Timestamp) {
    return {[TIMESTAMP_TYPE]: [value.seconds, value.nanoseconds]};
  }
  if (Array.isArray(value)) {
    return value.map((item) => encodeData(item));
  }
  if (isPlainObject(value)) {
    const result: any = {};
    for (const key of Object.keys(value)) {
      result[key] = encodeData(value[key]);
    }
    return result;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Reverses `encodeData()`.
 */
function decodeData(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => decodeData(item));
  }
  if (value && typeof value === 'object') {
    const timestamp = value[TIMESTAMP_TYPE];
    if (Array.isArray(timestamp)) {
      return new Timestamp(timestamp[0], timestamp[1]);
    }
    const result: any = {};
    for (const key of Object.keys(value)) {
      result[key] = decodeData(value[key]);
    }
    return result;
  }
  return value;
}
