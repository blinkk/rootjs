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
import cliProgress from 'cli-progress';
import {Timestamp} from 'firebase-admin/firestore';
import {bold, cyan, dim, green} from 'kleur/colors';
import type {RootCMSClient} from './client.js';
import type {SchemaWithTypes} from './schema.js';
import type {
  ImportTranslationsFromV1Progress,
  ImportTranslationsFromV1Result,
  TranslationsWriteCache,
} from './translations-manager.js';

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
    numSkippedStrings?: number;
    numLocaleDocs?: number;
    numCachedLocaleDocs?: number;
  };
}

export interface MigrateV1TranslationsOptions {
  /** What triggered the migration (used for logging/state). */
  trigger?: 'build' | 'dev' | 'cli';
  /**
   * Re-runs the migration even if it already completed, e.g. to pick up v1
   * translations that were edited after the first run. Locale docs written by
   * the migration are overwritten, so edits made in the v2 translations
   * manager since then are lost for any string that is also in v1.
   */
  force?: boolean;
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
 * Returns the state of the v1 -> v2 translations migration, or `null` if it
 * has never run for the project.
 */
export async function getTranslationsMigrationState(
  cmsClient: RootCMSClient
): Promise<TranslationsMigrationState | null> {
  const stateRef = cmsClient.db.doc(migrationStateDbPath(cmsClient.projectId));
  const snapshot = await stateRef.get();
  return (snapshot.data() as TranslationsMigrationState | undefined) || null;
}

/** Returns true if a migration state is complete for the current version. */
function isMigrationComplete(state?: TranslationsMigrationState) {
  return state?.status === 'complete' && state.version >= MIGRATION_VERSION;
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
  const force = Boolean(options?.force);
  const db = cmsClient.db;
  const stateRef = db.doc(migrationStateDbPath(cmsClient.projectId));

  // Fast path: a single read per boot. `complete` is the "migrated" tag.
  const snapshot = await stateRef.get();
  const state = snapshot.data() as TranslationsMigrationState | undefined;
  if (!force && isMigrationComplete(state)) {
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
    if (!force && isMigrationComplete(state)) {
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
  const progress = new MigrationProgress();
  try {
    const tm = cmsClient.getTranslationsManager();
    // v1 translations were live as soon as they were saved, so the migrated
    // translations must be published for the site to keep serving them.
    const res = await tm.importTranslationsFromV1({
      publish: true,
      modifiedBy: `root-cms migration (${trigger})`,
      getCollectionSchema: options?.getCollectionSchema,
      writeCache: writeCache,
      onProgress: (update) => progress.update(update),
    });
    progress.stop();
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
      printMigrationSummary(res, Date.now() - startedAt.toMillis());
    }
    return {status: 'complete', skipped: false};
  } catch (err) {
    progress.stop();
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

/** Labels for each step reported by `importTranslationsFromV1()`. */
const PROGRESS_STEPS: Record<
  ImportTranslationsFromV1Progress['step'],
  {label: string; unit: string}
> = {
  'fetch-docs': {label: 'Reading docs', unit: 'docs'},
  prune: {label: 'Pruning', unit: 'translations docs'},
  write: {label: 'Writing', unit: 'locale docs'},
};

/**
 * Renders a progress bar for each step of the migration. In a non-TTY
 * environment (e.g. CI), the progress is logged periodically instead.
 */
class MigrationProgress {
  private bar?: cliProgress.SingleBar;
  private step?: ImportTranslationsFromV1Progress['step'];

  update(progress: ImportTranslationsFromV1Progress) {
    // Hide steps with nothing to do (e.g. no doc-backed tags to read).
    if (progress.total === 0) {
      return;
    }
    if (progress.step === this.step) {
      this.bar?.update(progress.completed);
      return;
    }
    if (!this.step) {
      console.log(
        `${bold('[root cms]')} migrating v1 translations to the v2 ` +
          'translations manager'
      );
    }
    this.bar?.stop();
    this.step = progress.step;
    const {label, unit} = PROGRESS_STEPS[progress.step];
    this.bar = new cliProgress.SingleBar({
      format:
        `  ${label.padEnd(12)} ${cyan('{bar}')} {percentage}% ` +
        dim(`| {value}/{total} ${unit} | {duration_formatted}`),
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      barsize: 30,
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 5000,
    });
    this.bar.start(progress.total, progress.completed);
  }

  stop() {
    this.bar?.stop();
    this.bar = undefined;
  }
}

/** Prints summary tables for a completed migration. */
function printMigrationSummary(
  res: ImportTranslationsFromV1Result,
  durationMs: number
) {
  const {stats} = res;
  const rows: string[][] = [
    ['v1 strings migrated', formatNumber(stats.numStrings)],
    ['Translations docs', formatNumber(stats.numDocs)],
    ['Locale docs', formatNumber(stats.numLocaleDocs)],
  ];
  if (stats.numCachedLocaleDocs > 0) {
    rows.push(['Locale docs resumed', formatNumber(stats.numCachedLocaleDocs)]);
  }
  if (stats.numPrunedStrings > 0) {
    rows.push(['Unused strings pruned', formatNumber(stats.numPrunedStrings)]);
  }
  if (stats.numSkippedStrings > 0) {
    rows.push([
      'Collection-only strings skipped',
      formatNumber(stats.numSkippedStrings),
    ]);
  }
  rows.push(['Duration', `${(durationMs / 1000).toFixed(1)}s`]);

  const localeRows = Object.keys(res.locales)
    .sort()
    .map((locale) => [
      locale,
      formatNumber(res.locales[locale].numDocs),
      formatNumber(res.locales[locale].numStrings),
    ]);

  console.log();
  console.log(`${bold('[root cms]')} ${green('✔')} v1 translations migrated`);
  console.log(renderTable(['Summary', ''], rows));
  if (localeRows.length > 0) {
    console.log(renderTable(['Locale', 'Docs', 'Strings'], localeRows));
  }
}

/**
 * Renders a table with box-drawing borders. The first column is left-aligned
 * and the rest are right-aligned (for numbers).
 *
 * ```
 * renderTable(['Locale', 'Docs'], [['es', '12']]);
 * // ┌────────┬──────┐
 * // │ Locale │ Docs │
 * // ├────────┼──────┤
 * // │ es     │   12 │
 * // └────────┴──────┘
 * ```
 */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] || '').length))
  );
  const border = (left: string, mid: string, right: string) =>
    dim(left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right);
  const line = (cells: string[], format: (str: string) => string) => {
    const sep = dim('│');
    const padded = widths.map((w, i) => {
      const cell = cells[i] || '';
      return format(i === 0 ? cell.padEnd(w) : cell.padStart(w));
    });
    return `${sep} ${padded.join(` ${sep} `)} ${sep}`;
  };
  return [
    border('┌', '┬', '┐'),
    line(headers, bold),
    border('├', '┼', '┤'),
    ...rows.map((row) => line(row, (str) => str)),
    border('└', '┴', '┘'),
  ].join('\n');
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
