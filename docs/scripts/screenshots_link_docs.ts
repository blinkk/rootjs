/**
 * @fileoverview Links image fields that use a screenshot to the screenshot's
 * asset library file.
 *
 * `scripts/screenshots_upload.ts` uploads screenshots to the asset library, and
 * re-uploading one updates every draft doc that embeds the asset. Image fields
 * set before that (or by pasting a screenshot URL) only hold a copy of the
 * URL, so they never pick up new versions. This script scans every draft doc
 * for image fields whose `src` is a current or previous screenshot URL (from
 * the git history of `screenshots/screenshots.json`) and replaces them with
 * the asset's current file data plus its `assetId`. Alt text that was
 * customized in the doc is kept.
 *
 * Usage (from the `docs/` dir, after `screenshots_upload.ts`):
 *
 *   node scripts/screenshots_link_docs.ts --dry-run   # print what would change
 *   node scripts/screenshots_link_docs.ts
 *   node scripts/screenshots_link_docs.ts --collection Guides
 *
 * Only drafts are updated. Publish the updated docs in the CMS to make the
 * new screenshots live.
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import type {ScreenshotsMap} from '../screenshots/types.ts';
import {readScreenshots} from './screenshots_map.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
/** Recorded as the doc's `modifiedBy`. */
const MODIFIED_BY = 'screenshots_link_docs.ts';

interface Args {
  collections: string[];
  dryRun: boolean;
}

/** Parses `--collection` and `--dry-run` flags from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {collections: [], dryRun: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    if (flag === '--collection') {
      args.collections.push(inlineValue ?? argv[++i]);
    } else if (flag === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

/** A known screenshot URL and the alt text it was uploaded with. */
interface KnownSrc {
  sceneId: string;
  alt: string;
}

/**
 * Returns every version of `screenshots.json` in the git history, oldest
 * first, so URLs from earlier uploads can be matched.
 */
function readScreenshotsHistory(): ScreenshotsMap[] {
  const git = (...args: string[]) =>
    execFileSync('git', args, {cwd: DOCS_DIR, encoding: 'utf8'});
  const shas = git('log', '--format=%H', '--', 'screenshots/screenshots.json')
    .trim()
    .split('\n')
    .filter(Boolean)
    .reverse();
  return shas.map((sha) =>
    JSON.parse(git('show', `${sha}:./screenshots/screenshots.json`))
  );
}

/** Builds a lookup of screenshot URL (and GCS path) → scene. */
function buildSrcLookup(maps: ScreenshotsMap[]) {
  const lookup = new Map<string, KnownSrc>();
  for (const map of maps) {
    for (const [sceneId, entry] of Object.entries(map)) {
      const known = {sceneId, alt: entry.alt};
      lookup.set(entry.src, known);
      if (entry.gcsPath) {
        lookup.set(entry.gcsPath, known);
      }
    }
  }
  return lookup;
}

/** An image field value that should be linked to a screenshot asset. */
interface Match {
  path: string;
  value: any;
  known: KnownSrc;
}

/** Recursively finds unlinked image values that use a screenshot. */
function findMatches(
  data: any,
  lookup: Map<string, KnownSrc>,
  basePath: string,
  matches: Match[]
) {
  if (!data || typeof data !== 'object') {
    return;
  }
  if (Array.isArray(data)) {
    data.forEach((item, i) =>
      findMatches(item, lookup, `${basePath}.${i}`, matches)
    );
    return;
  }
  if (typeof data.src === 'string' && !data.assetId) {
    const known = lookup.get(data.src) || lookup.get(data.gcsPath);
    if (known) {
      matches.push({path: basePath, value: data, known});
      return;
    }
  }
  for (const key of Object.keys(data)) {
    findMatches(data[key], lookup, `${basePath}.${key}`, matches);
  }
}

/** Sets a value at a dot-separated path within an object. */
function setAtPath(data: any, dotPath: string, value: any) {
  const keys = dotPath.split('.');
  const last = keys.pop()!;
  let target = data;
  for (const key of keys) {
    target = target[key];
  }
  target[last] = value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = await readScreenshots();
  const unlinked = Object.keys(current).filter((id) => !current[id].assetId);
  if (unlinked.length > 0) {
    console.warn(
      `warning: skipping screenshot(s) not uploaded to the asset library: ${unlinked.join(', ')}. ` +
        'run scripts/screenshots_render.ts and scripts/screenshots_upload.ts to add them.'
    );
  }
  const lookup = buildSrcLookup([...readScreenshotsHistory(), current]);

  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const projectPath = `Projects/${client.projectId}`;

  // Fetch each screenshot's asset library file, the source of truth for the
  // embedded field values.
  const assets = new Map<string, any>();
  for (const [sceneId, entry] of Object.entries(current)) {
    if (!entry.assetId) {
      continue;
    }
    const asset = await client.getAsset(entry.assetId);
    if (!asset?.file) {
      throw new Error(
        `asset ${entry.assetId} for "${sceneId}" not found. ` +
          'run scripts/screenshots_upload.ts --force to re-upload it.'
      );
    }
    assets.set(sceneId, asset);
  }

  let collectionIds = (
    await client.db.collection(`${projectPath}/Collections`).listDocuments()
  ).map((ref) => ref.id);
  if (args.collections.length > 0) {
    collectionIds = collectionIds.filter((id) => args.collections.includes(id));
  }

  const updatedDocIds: string[] = [];
  for (const collectionId of collectionIds.sort()) {
    const snapshot = await client.db
      .collection(`${projectPath}/Collections/${collectionId}/Drafts`)
      .get();
    for (const doc of snapshot.docs) {
      const raw = doc.data();
      const matches: Match[] = [];
      findMatches(raw.fields, lookup, 'fields', matches);
      // Skip screenshots that aren't in the asset library (or have since been
      // removed from `screenshots.json`).
      const linkable = matches.filter((m) => assets.has(m.known.sceneId));
      for (const match of matches) {
        if (!assets.has(match.known.sceneId)) {
          console.log(
            `skipped: ${collectionId}/${doc.id} ${match.path} (${match.known.sceneId} is not in the asset library)`
          );
        }
      }
      if (linkable.length === 0) {
        continue;
      }
      const docId = `${collectionId}/${doc.id}`;
      for (const match of linkable) {
        const asset = assets.get(match.known.sceneId);
        console.log(
          `${args.dryRun ? '[dry-run] ' : ''}${docId} ${match.path} -> ${asset.parent}/${asset.name}`
        );
        const value: any = {...asset.file, assetId: asset.id};
        if (asset.file.altDisabled) {
          value.alt = '';
        } else if (match.value.alt && match.value.alt !== match.known.alt) {
          // Keep alt text that was customized in the doc.
          value.alt = match.value.alt;
        }
        if (match.value.canvasBgColor) {
          value.canvasBgColor = match.value.canvasBgColor;
        }
        setAtPath(raw, match.path, value);
      }
      if (!args.dryRun) {
        // `setRawDoc()` also updates the doc's `sys.assets` index, which the
        // asset library uses to fan out future uploads.
        raw.sys = {...raw.sys, modifiedAt: Date.now(), modifiedBy: MODIFIED_BY};
        await client.setRawDoc(collectionId, doc.id, raw, {mode: 'draft'});
      }
      updatedDocIds.push(docId);
    }
  }

  if (updatedDocIds.length === 0) {
    console.log('done: no drafts to update.');
    return;
  }
  console.log(
    `${args.dryRun ? '[dry-run] would update' : 'done: updated'} ${updatedDocIds.length} draft(s). ` +
      'publish them in the CMS to make the new screenshots live.'
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
