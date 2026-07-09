/**
 * Auto-migration of v1 translations to the v2 TranslationsManager.
 *
 * When the `experiments.v2TranslationsManager` flag is enabled, the CMS
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
 */

import {Timestamp} from 'firebase-admin/firestore';
import type {RootCMSClient} from './client.js';

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
  startedAt?: Timestamp;
  startedBy?: string;
  finishedAt?: Timestamp;
  error?: string;
  stats?: {
    numStrings: number;
    numDocs: number;
  };
}

export interface MigrateV1TranslationsOptions {
  /** What triggered the migration (used for logging/state). */
  trigger?: 'build' | 'dev';
}

export interface MigrateV1TranslationsResult {
  status: TranslationsMigrationStatus;
  /**
   * True if the migration was skipped, either because it already completed
   * or because another process holds the `running` lock.
   */
  skipped: boolean;
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
    const runningState: TranslationsMigrationState = {
      version: MIGRATION_VERSION,
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

  try {
    const tm = cmsClient.getTranslationsManager();
    const res = await tm.importTranslationsFromV1();
    // v1 translations were live as soon as they were saved, so the migrated
    // translations must be published for the site to keep serving them.
    if (res.ids.length > 0) {
      await tm.publishTranslationsBulk(res.ids, {
        publishedBy: `root-cms migration (${trigger})`,
      });
    }
    const completeState: TranslationsMigrationState = {
      version: MIGRATION_VERSION,
      status: 'complete',
      startedAt: startedAt,
      startedBy: startedBy,
      finishedAt: Timestamp.now(),
      stats: res.stats,
    };
    await stateRef.set(completeState);
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
