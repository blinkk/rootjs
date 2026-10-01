/**
 * @fileoverview Uploads rendered screenshots to the CMS asset library and
 * updates the JSON map.
 *
 * Reads the PNGs rendered by `scripts/screenshots_render.ts` (listed in
 * `screenshots/.out/manifest.json`) and uploads each to the asset library as
 * `screenshots/<scene-id>.png`, recording the asset id and public URL in
 * `screenshots/screenshots.json`. That JSON file is checked in and can be
 * imported by the docs site or read by seed scripts, e.g.:
 *
 * ```ts
 * import screenshots from '@/screenshots/screenshots.json';
 * const hero = screenshots['cms-editor-preview'];
 * // => {assetId, src, width, height, alt, gcsPath, hash}
 * ```
 *
 * The PNGs themselves are never committed to the repo.
 *
 * Re-uploading a screenshot replaces the asset's file, and the asset library
 * fans the new file out to every draft doc whose image field embeds the asset
 * (e.g. guides, blog posts and pages seeded with `screenshots.json`, or images
 * picked from the asset library in the CMS). The updated drafts still need to
 * be published. Image fields that point at a screenshot URL without linking to
 * the asset can be linked with `scripts/screenshots_link_docs.ts`.
 *
 * Usage (from the `docs/` dir):
 *
 *   node scripts/screenshots_render.ts
 *   node scripts/screenshots_upload.ts
 *   node scripts/screenshots_upload.ts --scene cms-editor-preview
 *   node scripts/screenshots_upload.ts --force     # re-upload unchanged images
 *   node scripts/screenshots_upload.ts --dry-run   # print what would change
 *
 * Or render and upload in one step with `pnpm screenshots:publish`.
 *
 * The upload refuses PNGs rendered from older scene sources (e.g. after
 * pulling scene changes without re-rendering). Re-render, or pass
 * `--allow-stale` to upload them anyway.
 *
 * Requires application-default credentials with access to the project's
 * Firestore and Storage bucket, e.g. `gcloud auth application-default login`.
 */

import crypto from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import type {
  ManifestEntry,
  ScreenshotEntry,
  ScreenshotsMap,
} from '../screenshots/types.ts';
import {hashScreenshotSources} from './screenshots_sources.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const SCREENSHOTS_DIR = path.join(DOCS_DIR, 'screenshots');
const OUT_DIR = path.join(SCREENSHOTS_DIR, '.out');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const MAP_PATH = path.join(SCREENSHOTS_DIR, 'screenshots.json');

/** Asset library folder that screenshots are uploaded to. */
const ASSET_FOLDER = 'screenshots';
/** Recorded in the asset library as the uploader. */
const UPLOADED_BY = 'screenshots_upload.ts';

interface Args {
  scenes: string[];
  force: boolean;
  dryRun: boolean;
  allowStale: boolean;
}

/** Parses `--scene`, `--force`, `--dry-run` and `--allow-stale` from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {
    scenes: [],
    force: false,
    dryRun: false,
    allowStale: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    if (flag === '--scene') {
      args.scenes.push(inlineValue ?? argv[++i]);
    } else if (flag === '--force') {
      args.force = true;
    } else if (flag === '--dry-run') {
      args.dryRun = true;
    } else if (flag === '--allow-stale') {
      args.allowStale = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function readJson<T>(filepath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filepath, 'utf8'));
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

/** Writes `screenshots.json`, sorted by scene id. */
async function writeMap(map: ScreenshotsMap) {
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  );
  await writeFile(MAP_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson<Record<string, ManifestEntry>>(
    MANIFEST_PATH,
    {}
  );
  if (Object.keys(manifest).length === 0) {
    throw new Error(
      `no rendered screenshots in ${OUT_DIR}. run scripts/screenshots_render.ts first.`
    );
  }
  const map = await readJson<ScreenshotsMap>(MAP_PATH, {});

  const ids = args.scenes.length > 0 ? args.scenes : Object.keys(manifest);
  const sourceHash = await hashScreenshotSources(SCREENSHOTS_DIR);
  const stale = ids.filter(
    (id) => manifest[id] && manifest[id].sourceHash !== sourceHash
  );
  if (stale.length > 0 && !args.allowStale) {
    throw new Error(
      `rendered screenshots are out of date with the scene sources: ${stale.join(', ')}.\n` +
        'run scripts/screenshots_render.ts first, or pass --allow-stale.'
    );
  }

  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  console.log(`project: ${client.projectId}`);
  console.log(`asset folder: ${ASSET_FOLDER}`);

  let changed = 0;
  const failedDocIds = new Set<string>();
  for (const id of ids) {
    const entry = manifest[id];
    if (!entry) {
      throw new Error(`scene "${id}" has not been rendered`);
    }
    const data = await readFile(path.join(OUT_DIR, entry.file));
    const hash = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .slice(0, 16);
    const existing = map[id];
    if (
      existing?.assetId &&
      existing.hash === hash &&
      existing.alt === entry.alt &&
      !args.force
    ) {
      console.log(`unchanged: ${id}`);
      continue;
    }

    // Replace the asset recorded in `screenshots.json` when it still exists
    // (even if it was renamed or moved in the CMS), otherwise upload to
    // `screenshots/<id>.png`, which replaces an existing file by that name.
    const filename = `${id}.png`;
    const asset = existing?.assetId
      ? await client.getAsset(existing.assetId)
      : null;
    const assetId = asset?.type === 'file' ? asset.id : undefined;
    if (args.dryRun) {
      const target = assetId
        ? `asset ${assetId}`
        : `${ASSET_FOLDER}/${filename}`;
      console.log(`[dry-run] would upload ${id} -> ${target}`);
      changed++;
      continue;
    }

    const res = await client.uploadAsset(data, {
      folder: ASSET_FOLDER,
      name: filename,
      filename: filename,
      assetId: assetId,
      alt: entry.alt,
      modifiedBy: UPLOADED_BY,
    });
    const file = res.asset.file!;
    const screenshot: ScreenshotEntry = {
      assetId: res.asset.id,
      src: file.src,
      width: file.width!,
      height: file.height!,
      alt: entry.alt,
      gcsPath: file.gcsPath,
      hash,
    };
    map[id] = screenshot;
    // Save after each upload so a later failure doesn't lose the asset ids.
    await writeMap(map);
    changed++;
    console.log(`${res.status}: ${id} (asset ${res.asset.id}) -> ${file.src}`);
    if (res.sync) {
      const {updatedDocIds} = res.sync;
      if (updatedDocIds.length > 0) {
        console.log(`  updated draft(s): ${updatedDocIds.join(', ')}`);
      }
      res.sync.failedDocIds.forEach((docId) => failedDocIds.add(docId));
    }
  }

  if (args.dryRun) {
    console.log(`[dry-run] ${changed} screenshot(s) would change`);
    return;
  }
  console.log(
    `done: ${changed} screenshot(s) updated in ${path.relative(DOCS_DIR, MAP_PATH)}`
  );
  if (failedDocIds.size > 0) {
    throw new Error(
      `failed to update draft(s): ${Array.from(failedDocIds).join(', ')}. ` +
        'retry with `root-cms client.call syncAssetToDocs \'["<assetId>"]\'`.'
    );
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
