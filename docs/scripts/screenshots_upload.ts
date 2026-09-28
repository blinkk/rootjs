/**
 * @fileoverview Uploads rendered screenshots to GCS and updates the JSON map.
 *
 * Reads the PNGs rendered by `scripts/screenshots_render.ts` (listed in
 * `screenshots/.out/manifest.json`), uploads each to the project's Firebase
 * Storage bucket under a content-hashed name, and records the public URL in
 * `screenshots/screenshots.json`. That JSON file is checked in and can be
 * imported by the docs site or read by seed scripts, e.g.:
 *
 * ```ts
 * import screenshots from '@/screenshots/screenshots.json';
 * const hero = screenshots['cms-editor-preview'];
 * // => {src, width, height, alt, gcsPath, hash}
 * ```
 *
 * The PNGs themselves are never committed to the repo.
 *
 * When the CMS plugin has `gci` enabled, the image is registered with the
 * Google Cloud Image service (the same thing the CMS does on upload) so `src`
 * is an `lh3.googleusercontent.com` URL that supports resizing and format
 * conversion (see `hooks/useImageService.ts`). Otherwise `src` is the plain
 * `storage.googleapis.com` URL.
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
 * Requires application-default credentials with write access to the bucket,
 * e.g. `gcloud auth application-default login`.
 */

import crypto from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {getStorage} from 'firebase-admin/storage';
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

/** Default GCI service used by the CMS when `gci: true`. */
const DEFAULT_GCI_DOMAIN = 'https://services.rootjs.dev';
/** Recorded in the object metadata as the uploader. */
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

/** Reads the pixel dimensions from a PNG's IHDR chunk. */
function getPngSize(data: Buffer) {
  const PNG_SIGNATURE = '89504e470d0a1a0a';
  if (data.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error('not a png file');
  }
  return {width: data.readUInt32BE(16), height: data.readUInt32BE(20)};
}

/** Returns a GCI serving URL for an uploaded object, or '' if unavailable. */
async function getGciUrl(gciDomain: string, gcsPath: string) {
  const params = new URLSearchParams({gcs: gcsPath});
  const url = `${gciDomain}/_/serving_url?${params.toString()}`;
  const res = await fetch(url);
  if (res.status !== 200) {
    console.warn(`failed to get gci url (${res.status}): ${await res.text()}`);
    return '';
  }
  const data = (await res.json()) as {servingUrl?: string};
  return data.servingUrl || '';
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
  const cmsConfig = client.cmsPlugin.getConfig();
  const bucketName = cmsConfig.firebaseConfig.storageBucket;
  const gciDomain =
    cmsConfig.gci === true ? DEFAULT_GCI_DOMAIN : cmsConfig.gci || '';
  const bucket = getStorage(client.app).bucket(bucketName);

  console.log(`bucket: ${bucketName}`);
  console.log(`gci: ${gciDomain || '(disabled)'}`);

  let changed = 0;
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
    if (existing?.hash === hash && existing.alt === entry.alt && !args.force) {
      console.log(`unchanged: ${id}`);
      continue;
    }

    const {width, height} = getPngSize(data);
    const destination = `${client.projectId}/screenshots/${id}.${hash}.png`;
    const gcsPath = `/${bucketName}/${destination}`;
    if (args.dryRun) {
      console.log(`[dry-run] would upload ${id} -> gs:/${gcsPath}`);
      changed++;
      continue;
    }

    await bucket.file(destination).save(data, {
      resumable: false,
      contentType: 'image/png',
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          filename: `${id}.png`,
          width: String(width),
          height: String(height),
          uploadedBy: UPLOADED_BY,
          uploadedAt: String(Date.now()),
        },
      },
    });
    let src = `https://storage.googleapis.com${gcsPath}`;
    if (gciDomain) {
      src = (await getGciUrl(gciDomain, gcsPath)) || src;
    }
    const screenshot: ScreenshotEntry = {
      src,
      width,
      height,
      alt: entry.alt,
      gcsPath,
      hash,
    };
    map[id] = screenshot;
    changed++;
    console.log(`uploaded: ${id} -> ${src}`);
  }

  if (args.dryRun) {
    console.log(`[dry-run] ${changed} screenshot(s) would change`);
    return;
  }
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  );
  await writeFile(MAP_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(
    `done: ${changed} screenshot(s) updated in ${path.relative(DOCS_DIR, MAP_PATH)}`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
