/**
 * @fileoverview Copies the technical docs from the old `Guide` collection
 * (served at `/guide/`) to the `Docs` collection (served at `/docs/`).
 *
 * For every `Guide/<slug>` doc, the script copies:
 *
 * - the draft and the published doc, with their `sys` metadata intact;
 * - the draft's version history (`Drafts/<slug>/Versions`);
 * - the translations, by tagging each string tagged `Guide/<slug>` with
 *   `Docs/<slug>` too (the strings themselves are shared).
 *
 * While copying, the content is rewritten to match the new collection:
 * references to `Guide/*` docs point to `Docs/*`, the `meta.nextGuide` field is
 * renamed to `meta.nextDoc`, and links to `/guide/...` point to `/docs/...`
 * (the old URLs redirect, see `root.config.ts`, but direct links avoid a hop).
 *
 * The `Guide` docs are left in place. Once the `Docs` collection looks right,
 * delete them from Firestore (the `Guide` schema no longer exists, so they
 * aren't shown in the CMS).
 *
 * Run from the `docs/` dir:
 *
 *   node scripts/migrate_guide_to_docs.ts --dry-run   # print what would change
 *   node scripts/migrate_guide_to_docs.ts             # copy the docs
 *   node scripts/migrate_guide_to_docs.ts --force     # overwrite Docs/* docs
 *
 * By default the script refuses to overwrite a `Docs` doc that already exists,
 * so edits made in the CMS aren't lost.
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {FieldValue} from 'firebase-admin/firestore';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const SOURCE = 'Guide';
const TARGET = 'Docs';
/** Max writes per Firestore batch. */
const BATCH_SIZE = 400;

/**
 * Matches `/guide` URL paths in links, e.g. `href="/guide/routes"` or
 * `https://rootjs.dev/guide/`, but not `/guides/` or `/foo/guide/`.
 */
const GUIDE_URL_REGEX = /(^|["'(\s=]|rootjs\.dev)\/guide(?=[/"'#?\s)]|$)/g;

interface Args {
  force: boolean;
  dryRun: boolean;
}

/** Parses `--force` and `--dry-run` flags from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {force: false, dryRun: false};
  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

/** Whether a value is a plain object or array (not a Timestamp, etc.). */
function isPlainContainer(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns a copy of raw doc data with `Guide` references and `/guide` links
 * rewritten. Each changed string is recorded in `changes`.
 */
function rewrite(value: unknown, changes: string[]): unknown {
  if (typeof value === 'string') {
    let next = value.replace(GUIDE_URL_REGEX, '$1/docs');
    if (next.startsWith(`${SOURCE}/`)) {
      // Doc ids in reference fields, e.g. `Guide/routes`.
      next = `${TARGET}/${next.slice(SOURCE.length + 1)}`;
    }
    if (next !== value) {
      changes.push(`${truncate(value)} → ${truncate(next)}`);
    }
    return next;
  }
  if (!isPlainContainer(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewrite(item, changes));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // References store the collection id alongside the doc id.
    if (key === 'collection' && item === SOURCE) {
      result[key] = TARGET;
      continue;
    }
    result[key] = rewrite(item, changes);
  }
  return result;
}

/** Shortens a string for logging. */
function truncate(str: string, maxLength = 100) {
  const oneLine = str.replace(/\s+/g, ' ');
  return oneLine.length > maxLength
    ? `${oneLine.slice(0, maxLength - 1)}…`
    : oneLine;
}

/** Converts a raw `Guide` doc to a `Docs` doc. */
function convertDoc(slug: string, data: any, changes: string[]) {
  const fields = data.fields || {};
  if (fields.meta && 'nextGuide' in fields.meta) {
    const {nextGuide, ...meta} = fields.meta;
    fields.meta = {...meta, nextDoc: nextGuide};
    changes.push('meta.nextGuide → meta.nextDoc');
  }
  const converted = rewrite({...data, fields}, changes) as any;
  converted.id = `${TARGET}/${slug}`;
  converted.collection = TARGET;
  converted.slug = slug;
  return converted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const db = client.db;

  const writes: Array<{path: string; data: any; merge?: boolean}> = [];
  const conflicts: string[] = [];
  let docCount = 0;

  for (const mode of ['draft', 'published'] as const) {
    const sourcePath = client.dbCollectionDocsPath(SOURCE, {mode});
    const targetPath = client.dbCollectionDocsPath(TARGET, {mode});
    const snapshot = await db.collection(sourcePath).get();
    for (const doc of snapshot.docs) {
      const slug = doc.id;
      const changes: string[] = [];
      const data = convertDoc(slug, doc.data(), changes);
      const existing = await db.doc(`${targetPath}/${slug}`).get();
      if (existing.exists && !args.force) {
        conflicts.push(`${TARGET}/${slug} (${mode})`);
      }
      writes.push({path: `${targetPath}/${slug}`, data});
      docCount += 1;
      console.log(`${mode}: ${SOURCE}/${slug} → ${TARGET}/${slug}`);
      for (const change of changes) {
        console.log(`  ${change}`);
      }

      if (mode === 'draft') {
        const versions = await db
          .collection(`${sourcePath}/${slug}/Versions`)
          .get();
        for (const version of versions.docs) {
          const versionData = convertDoc(slug, version.data(), []);
          writes.push({
            path: `${targetPath}/${slug}/Versions/${version.id}`,
            data: versionData,
          });
        }
        if (versions.size > 0) {
          console.log(`  + ${versions.size} version(s)`);
        }

        const translations = await db
          .collection(`Projects/${client.projectId}/Translations`)
          .where('tags', 'array-contains', `${SOURCE}/${slug}`)
          .get();
        for (const translation of translations.docs) {
          writes.push({
            path: translation.ref.path,
            data: {tags: FieldValue.arrayUnion(`${TARGET}/${slug}`)},
            merge: true,
          });
        }
        if (translations.size > 0) {
          console.log(`  + ${translations.size} translation string(s)`);
        }
      }
    }
  }

  if (docCount === 0) {
    console.log(`no docs found in the ${SOURCE} collection`);
    return;
  }
  const conflictsMessage = `these docs already exist, pass --force to overwrite them:\n  ${conflicts.join('\n  ')}`;
  if (args.dryRun) {
    if (conflicts.length > 0) {
      console.warn(`warning: ${conflictsMessage}`);
    }
    console.log(`dry run: ${writes.length} write(s) skipped`);
    return;
  }
  if (conflicts.length > 0) {
    throw new Error(conflictsMessage);
  }

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BATCH_SIZE)) {
      batch.set(db.doc(write.path), write.data, {merge: !!write.merge});
    }
    await batch.commit();
  }
  console.log(`done: copied ${docCount} doc(s) with ${writes.length} write(s)`);
  console.log(
    `once /docs/ looks right, delete the old docs under ${client.dbCollectionDocsPath(SOURCE, {mode: 'draft'}).replace(/\/Drafts$/, '')}`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
