import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {bold, dim, green, red, yellow} from 'kleur/colors';
import type {TranslationsMigrationState} from '../core/translations-migration.js';

type ProjectModule = typeof import('../core/project.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TranslationsMigrateOptions {
  /** Print the migration status without migrating anything. */
  status?: boolean;
  /** Re-run the migration even if it already completed. */
  force?: boolean;
}

/**
 * Migrates the project's v1 translations to the v2 translations manager.
 *
 * The CMS runs the same migration automatically on the first `root dev` or
 * `root build` (unless `v2TranslationsManager` is disabled). This command
 * runs it on demand, e.g. as a step of an upgrade, and with `--status`
 * reports whether it has run without changing anything.
 *
 * Usage:
 *   root-cms translations.migrate --status
 *   root-cms translations.migrate
 *   root-cms translations.migrate --force
 */
export async function translationsMigrate(
  options: TranslationsMigrateOptions = {}
) {
  const [{RootCMSClient}, migration] = await Promise.all([
    import('../core/client.js'),
    import('../core/translations-migration.js'),
  ]);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsClient = new RootCMSClient(rootConfig);

  if (!cmsClient.isV2TranslationsEnabled()) {
    console.error(
      red('the v2 translations manager is disabled in root.config.ts.') +
        ' remove `experiments: {v2TranslationsManager: false}` from ' +
        'cmsPlugin() to migrate.'
    );
    process.exitCode = 1;
    return;
  }

  const state = await migration.getTranslationsMigrationState(cmsClient);
  if (options.status) {
    const v1Snapshot = await cmsClient.db
      .collection(`Projects/${cmsClient.projectId}/Translations`)
      .count()
      .get();
    printStatus(state, v1Snapshot.data().count);
    return;
  }

  if (state?.status === 'complete' && !options.force) {
    printStatus(state);
    console.log(dim('already migrated. re-run with --force to migrate again.'));
    return;
  }

  // Unused strings are pruned by checking the docs they're tagged with
  // against the collection schemas, which are loaded through vite.
  const project = (await viteSsrLoadModule(
    rootConfig,
    path.resolve(__dirname, './project.js')
  )) as ProjectModule;
  const res = await migration.migrateV1TranslationsIfNeeded(cmsClient, {
    trigger: 'cli',
    force: options.force,
    getCollectionSchema: async (collectionId) =>
      project.getCollectionSchema(collectionId),
    cacheDir: path.join(rootDir, 'node_modules', '.cache', 'root-cms'),
  });
  if (res.skipped) {
    console.log(
      yellow('skipped: another process is running the migration.') +
        ' try again in a few minutes, or check with --status.'
    );
    return;
  }
  const newState = await migration.getTranslationsMigrationState(cmsClient);
  if (!newState?.stats?.numStrings) {
    console.log(`${green('✔')} done (no v1 translations to migrate)`);
  }
}

/** Prints the migration state in a human-readable format. */
function printStatus(
  state: TranslationsMigrationState | null,
  numV1Strings?: number
) {
  const rows: Array<[string, string]> = [];
  rows.push(['status', formatStatus(state?.status)]);
  if (numV1Strings !== undefined) {
    rows.push(['v1 strings', String(numV1Strings)]);
  }
  if (state) {
    rows.push(['version', String(state.version)]);
    if (state.startedBy) {
      rows.push(['started by', state.startedBy]);
    }
    if (state.startedAt) {
      rows.push(['started at', state.startedAt.toDate().toISOString()]);
    }
    if (state.finishedAt) {
      rows.push(['finished at', state.finishedAt.toDate().toISOString()]);
    }
    if (state.stats) {
      rows.push(['strings migrated', String(state.stats.numStrings)]);
      rows.push(['translations docs', String(state.stats.numDocs)]);
      if (state.stats.numPrunedStrings) {
        rows.push([
          'unused strings pruned',
          String(state.stats.numPrunedStrings),
        ]);
      }
    }
    if (state.error) {
      rows.push(['error', state.error]);
    }
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log(bold('v1 -> v2 translations migration'));
  for (const [label, value] of rows) {
    console.log(`  ${dim(label.padEnd(width))}  ${value}`);
  }
}

function formatStatus(status?: TranslationsMigrationState['status']) {
  if (status === 'complete') {
    return green('complete');
  }
  if (status === 'running') {
    return yellow('running');
  }
  if (status === 'error') {
    return red('error');
  }
  return yellow('not started');
}
