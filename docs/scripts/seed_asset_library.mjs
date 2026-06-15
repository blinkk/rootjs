/**
 * @fileoverview Seeds the asset library with test data to exercise pagination.
 *
 * Creates a `test-pagination` folder in the asset library and backfills it with
 * N (default 200) image assets. Each asset is a self-contained `data:` URI SVG
 * with a distinct, readable name like `foo-bar-baz.svg`, so no GCS upload is
 * required. Because the asset library paginates at 100 assets per page, the
 * default of 200 produces two full pages of results to page through.
 *
 * Run from the root of a Root.js CMS project (one with a `root.config.ts`),
 * e.g. the `docs/` site:
 *
 *   node scripts/seed_asset_library.mjs
 *   node scripts/seed_asset_library.mjs --count 250
 *   node scripts/seed_asset_library.mjs --folder test-pagination
 *   node scripts/seed_asset_library.mjs --clear   # remove existing files first
 *
 * Requires application-default credentials for the project's Firestore (the
 * same auth used by the other root-cms admin scripts).
 *
 * Note: by default the script appends, so re-running adds another `--count`
 * assets. Pass `--clear` to delete the folder's existing files before seeding.
 */

import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {Timestamp} from 'firebase-admin/firestore';

/** Default number of assets to create. Two pages at 100 assets/page. */
const DEFAULT_COUNT = 200;
/** Default folder to seed into. */
const DEFAULT_FOLDER = 'test-pagination';
/** Email recorded as the creator/modifier of the seeded assets. */
const SEED_USER = 'seed-asset-library@rootjs.dev';
/** Max writes per Firestore batch (the hard limit is 500). */
const BATCH_SIZE = 400;

// Word lists combined to generate distinct, readable asset names. Three lists
// of eight yield 8 * 8 * 8 = 512 unique three-word combinations, enough for the
// default count without needing a numeric suffix.
const ADJECTIVES = [
  'foo',
  'azure',
  'crimson',
  'golden',
  'silent',
  'cosmic',
  'velvet',
  'lunar',
];
const NOUNS = [
  'bar',
  'falcon',
  'harbor',
  'meadow',
  'cipher',
  'lantern',
  'comet',
  'willow',
];
const SUFFIXES = [
  'baz',
  'alpha',
  'echo',
  'nova',
  'delta',
  'prime',
  'flux',
  'zen',
];

/** Background colors cycled through so thumbnails are visually distinct. */
const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

/** The id charset used by the CMS asset library (mirrors `autokey`). */
const ID_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Generates a random asset id, matching the CMS `autokey(12)` format. */
function autokey(len = 12) {
  let result = '';
  for (let i = 0; i < len; i++) {
    result += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  }
  return result;
}

/** Parses `--count`, `--folder` and `--clear` flags from argv. */
function parseArgs(argv) {
  const args = {
    count: DEFAULT_COUNT,
    folder: DEFAULT_FOLDER,
    clear: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    const nextValue = () => inlineValue ?? argv[++i];
    if (flag === '--count') {
      const count = parseInt(nextValue(), 10);
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error(`invalid --count value: ${arg}`);
      }
      args.count = count;
    } else if (flag === '--folder') {
      const folder = nextValue();
      if (!folder || /[/\\]/.test(folder)) {
        throw new Error(`invalid --folder value: ${arg}`);
      }
      args.folder = folder;
    } else if (flag === '--clear') {
      args.clear = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

/**
 * Builds a distinct, readable name for the asset at index `i`, e.g.
 * `foo-bar-baz.svg`. Treats `i` as a mixed-radix number over the three word
 * lists; if more assets are requested than there are unique combinations, a
 * numeric suffix is appended to keep names unique.
 */
function buildName(i, usedNames) {
  const idxA =
    Math.floor(i / (NOUNS.length * SUFFIXES.length)) % ADJECTIVES.length;
  const idxB = Math.floor(i / SUFFIXES.length) % NOUNS.length;
  const idxC = i % SUFFIXES.length;
  const base = `${ADJECTIVES[idxA]}-${NOUNS[idxB]}-${SUFFIXES[idxC]}`;
  let name = `${base}.svg`;
  // Once the unique combinations are exhausted, disambiguate with a suffix.
  let dedupe = 2;
  while (usedNames.has(name)) {
    name = `${base}-${dedupe}.svg`;
    dedupe++;
  }
  usedNames.add(name);
  return name;
}

/** Escapes text for safe inclusion in SVG/XML markup. */
function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Builds a `data:` URI for a 200x200 SVG labeled with the asset name. */
function buildSvgDataUri(label, color) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" ' +
    'viewBox="0 0 200 200">' +
    `<rect width="200" height="200" fill="${color}"/>` +
    '<text x="100" y="105" font-family="monospace" font-size="13" ' +
    `fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>` +
    '</svg>';
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/** Deletes all file assets directly within `folder`. */
async function clearFolder(db, assetsPath, folder) {
  const snapshot = await db
    .collection(assetsPath)
    .where('parent', '==', folder)
    .get();
  if (snapshot.empty) {
    return 0;
  }
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    ops++;
    deleted++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  return deleted;
}

async function main() {
  const {count, folder, clear} = parseArgs(process.argv.slice(2));

  const rootConfig = await loadRootConfig(process.cwd());
  const client = new RootCMSClient(rootConfig);
  const db = client.db;
  const projectId = client.projectId;
  const assetsPath = `Projects/${projectId}/Assets`;

  console.log(`project: ${projectId}`);
  console.log(`folder: ${folder}`);

  if (clear) {
    const deleted = await clearFolder(db, assetsPath, folder);
    console.log(`cleared ${deleted} existing asset(s) from "${folder}"`);
  }

  // Create the folder doc. The id is derived from the path (mirroring the CMS)
  // and merge:true keeps existing created metadata if it already exists.
  const folderId = `folder-${encodeURIComponent(folder)}`;
  const folderTs = Timestamp.now();
  await db.doc(`${assetsPath}/${folderId}`).set(
    {
      id: folderId,
      type: 'folder',
      parent: '',
      name: folder,
      createdAt: folderTs,
      createdBy: SEED_USER,
      modifiedAt: folderTs,
      modifiedBy: SEED_USER,
    },
    {merge: true}
  );

  // Backfill file assets in batches.
  const usedNames = new Set();
  let batch = db.batch();
  let ops = 0;
  for (let i = 0; i < count; i++) {
    const name = buildName(i, usedNames);
    const color = COLORS[i % COLORS.length];
    const src = buildSvgDataUri(name, color);
    const assetId = autokey(12);
    const ts = Timestamp.now();
    batch.set(db.doc(`${assetsPath}/${assetId}`), {
      id: assetId,
      type: 'file',
      parent: folder,
      name: name,
      file: {
        src: src,
        filename: name,
        width: 200,
        height: 200,
        alt: '',
        uploadedBy: SEED_USER,
        uploadedAt: ts.toMillis(),
      },
      createdAt: ts,
      createdBy: SEED_USER,
      modifiedAt: ts,
      modifiedBy: SEED_USER,
    });
    ops++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      console.log(`seeded ${i + 1}/${count}...`);
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  console.log(`done: seeded ${count} asset(s) into "${folder}".`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
