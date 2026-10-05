/**
 * Auto-migration of v1 translations to the v2 TranslationsManager.
 *
 * When the v2 translations manager is enabled (the default), the CMS
 * plugin runs `migrateV1TranslationsIfNeeded()` on dev server startup and
 * before prod builds. The migration copies the v1 translations
 * (`Projects/{p}/Translations`) into per-locale v2 docs and publishes them
 * (v1 translations were live as soon as they were saved, so the migrated
 * data must be live too). The v1 data is left untouched as a backup.
 *
 * Migration state is tracked in a
 * `Projects/{p}/TranslationsManager/migration` doc (a sibling of the
 * `draft`/`published` container docs) so the migration only runs once. A
 * Firestore transaction guards against concurrent runs; a stale `running`
 * lock expires after 10 minutes.
 *
 * When a `cacheDir` is provided, the locale docs saved by a run are recorded
 * in a local file so that a retry after a failure (e.g. a timeout partway
 * through a large migration) skips them. The file is removed once the
 * migration completes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import type {RootCMSClient} from './client.js';
import type {SchemaWithTypes} from './schema.js';
import type {TranslationsWriteCache} from './translations-manager.js';

/**
 * Bump this version to force the migration to re-run on projects that have
 * already completed an older version of the migration.
 */
const MIGRATION_VERSION = 1;

/** A `running` migration lock older than this is considered stale. */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export type TranslationsMigrationStatus = 'running' | 'complete' | 'error';

export interface TranslationsMigrationState {
  version: number;
  status: TranslationsMigrationStatus;
  /**
   * Identifies a migration across retries. Kept when a failed or stale run is
   * retried, so the retry can resume from the local write cache.
   */
  runId?: string;
  startedAt?: Timestamp;
  startedBy?: string;
  finishedAt?: Timestamp;
  error?: string;
  stats?: {
    numStrings: number;
    numDocs: number;
    numPrunedStrings?: number;
  };
}

export interface MigrateV1TranslationsOptions {
  /** What triggered the migration (used for logging/state). */
  trigger?: 'build' | 'dev';
  /**
   * Loads a collection's schema. When provided, strings that are no longer
   * used by the docs they're tagged with are pruned instead of migrated.
   */
  getCollectionSchema?: (
    collectionId: string
  ) => Promise<SchemaWithTypes | null>;
  /**
   * Directory for the local write cache, used to resume a failed migration.
   * When omitted, a retry re-saves everything.
   */
  cacheDir?: string;
}

export interface MigrateV1TranslationsResult {
  status: TranslationsMigrationStatus;
  /**
   * True if the migration was skipped, either because it already completed
   * or because another process holds the `running` lock.
   */
  skipped: boolean;
}

/**
 * gRPC status codes that indicate a credentials or permissions problem.
 */
const GRPC_PERMISSION_DENIED = 7;
const GRPC_UNAUTHENTICATED = 16;

/**
 * Returns true if an error looks like it was caused by missing or invalid
 * Google Cloud credentials (e.g. no ADC, expired login, or no IAM access).
 */
export function isFirestoreAuthError(err: unknown): boolean {
  const code = (err as {code?: unknown})?.code;
  if (code === GRPC_PERMISSION_DENIED || code === GRPC_UNAUTHENTICATED) {
    return true;
  }
  const message = String((err as {message?: unknown})?.message ?? err);
  return /default credentials|invalid_grant|invalid_rapt|reauth/i.test(message);
}

function migrationStateDbPath(projectId: string) {
  return `Projects/${projectId}/TranslationsManager/migration`;
}

/**
 * Migrates v1 translations to the v2 TranslationsManager if the migration
 * hasn't already run for this project. Safe to call on every dev server boot
 * and build: after the first successful run, this costs a single Firestore
 * read.
 */
export async function migrateV1TranslationsIfNeeded(
  cmsClient: RootCMSClient,
  options?: MigrateV1TranslationsOptions
): Promise<MigrateV1TranslationsResult> {
  const trigger = options?.trigger || 'build';
  const db = cmsClient.db;
  const stateRef = db.doc(migrationStateDbPath(cmsClient.projectId));

  // Fast path: a single read per boot. `complete` is the "migrated" tag.
  const snapshot = await stateRef.get();
  const state = snapshot.data() as TranslationsMigrationState | undefined;
  if (state?.status === 'complete' && state.version >= MIGRATION_VERSION) {
    return {status: 'complete', skipped: true};
  }

  const startedAt = Timestamp.now();
  const startedBy = `root-cms (${trigger})`;
  let runId: string = crypto.randomUUID();

  // Claim the migration via a transaction so that only one process runs it
  // (e.g. multiple devs booting dev servers at the same time).
  const claimed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(stateRef);
    const state = snapshot.data() as TranslationsMigrationState | undefined;
    if (state?.status === 'complete' && state.version >= MIGRATION_VERSION) {
      return false;
    }
    if (state?.status === 'running') {
      const startedAt = state.startedAt?.toMillis?.() || 0;
      if (Date.now() - startedAt < STALE_LOCK_TIMEOUT_MS) {
        return false;
      }
      console.warn(
        '[root cms] taking over stale translations migration lock ' +
          `(started ${new Date(startedAt).toISOString()})`
      );
    }
    // Keep the run id of a failed or stale run so that this run can resume
    // from its write cache.
    if (
      state?.runId &&
      state.version === MIGRATION_VERSION &&
      state.status !== 'complete'
    ) {
      runId = state.runId;
    }
    const runningState: TranslationsMigrationState = {
      version: MIGRATION_VERSION,
      runId: runId,
      status: 'running',
      startedAt: startedAt,
      startedBy: startedBy,
    };
    tx.set(stateRef, runningState);
    return true;
  });
  if (!claimed) {
    return {status: state?.status || 'running', skipped: true};
  }

  const writeCache = options?.cacheDir
    ? await FileWriteCache.load(
        path.join(
          options.cacheDir,
          `translations-migration-${cmsClient.projectId}-${runId}.txt`
        )
      )
    : undefined;
  try {
    const tm = cmsClient.getTranslationsManager();
    // v1 translations were live as soon as they were saved, so the migrated
    // translations must be published for the site to keep serving them.
    const res = await tm.importTranslationsFromV1({
      publish: true,
      modifiedBy: `root-cms migration (${trigger})`,
      getCollectionSchema: options?.getCollectionSchema,
      writeCache: writeCache,
    });
    const completeState: TranslationsMigrationState = {
      version: MIGRATION_VERSION,
      runId: runId,
      status: 'complete',
      startedAt: startedAt,
      startedBy: startedBy,
      finishedAt: Timestamp.now(),
      stats: res.stats,
    };
    await stateRef.set(completeState);
    await writeCache?.remove();
    if (res.ids.length > 0) {
      console.log(
        `[root cms] migrated ${res.stats.numStrings} v1 translation(s) into ` +
          `${res.stats.numDocs} translations doc(s)`
      );
    }
    return {status: 'complete', skipped: false};
  } catch (err) {
    const errorState: Partial<TranslationsMigrationState> = {
      status: 'error',
      finishedAt: Timestamp.now(),
      error: String(err),
    };
    // Best effort: release the lock so a subsequent boot can retry.
    await stateRef.set(errorState, {merge: true}).catch((stateErr) => {
      console.error(
        '[root cms] failed to save translations migration error state:',
        stateErr
      );
    });
    throw err;
  }
}

/**
 * A `TranslationsWriteCache` backed by an append-only file with one cache key
 * per line. Failures to read or write the file are logged and otherwise
 * ignored, since the cache is only an optimization.
 */
class FileWriteCache implements TranslationsWriteCache {
  private readonly filePath: string;
  private readonly keys: Set<string>;
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(filePath: string, keys: Set<string>) {
    this.filePath = filePath;
    this.keys = keys;
  }

  static async load(filePath: string): Promise<FileWriteCache> {
    let keys = new Set<string>();
    try {
      const contents = await fs.readFile(filePath, 'utf8');
      keys = new Set(contents.split('\n').filter(Boolean));
    } catch (err) {
      if ((err as {code?: string})?.code !== 'ENOENT') {
        console.warn('[root cms] failed to read translations cache:', err);
      }
    }
    if (keys.size > 0) {
      console.log(
        `[root cms] resuming translations migration from ${filePath}`
      );
    }
    return new FileWriteCache(filePath, keys);
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  add(keys: string[]): Promise<void> {
    keys.forEach((key) => this.keys.add(key));
    // Serialize appends so that lines from parallel batches don't interleave.
    this.pendingWrite = this.pendingWrite.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), {recursive: true});
        await fs.appendFile(this.filePath, keys.join('\n') + '\n', 'utf8');
      } catch (err) {
        console.warn('[root cms] failed to write translations cache:', err);
      }
    });
    return this.pendingWrite;
  }

  async remove() {
    await this.pendingWrite;
    await fs.rm(this.filePath, {force: true}).catch(() => {});
  }
}
