/**
 * @fileoverview Seeds the `Guides` collection with the non-technical Root.js
 * guides, so they can be reviewed and edited in the CMS at `/guides/`.
 *
 * The copy lives in `guides_content.ts`. Images come from
 * `screenshots/screenshots.json` (see `screenshots_render.ts` and
 * `screenshots_upload.ts`); sections whose screenshot hasn't been uploaded yet
 * are seeded without an image.
 *
 * Run from the `docs/` dir:
 *
 *   node scripts/seed_guides.ts --dry-run            # print the fields as JSON
 *   node scripts/seed_guides.ts                      # create every guide
 *   node scripts/seed_guides.ts --guide publishing   # create one guide
 *   node scripts/seed_guides.ts --force              # overwrite existing drafts
 *
 * By default the script skips guides whose draft already exists, so edits made
 * in the CMS aren't lost. With `--force`, each previous draft is first backed
 * up to a JSON file in the OS temp dir.
 *
 * The collection uses `customSorting`, so the order on the `/guides/` index is
 * set by dragging docs in the CMS. Guides that don't have a position yet are
 * added after the existing ones, in the order they're listed in
 * `guides_content.ts`. Existing positions are never changed.
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient, generateKeyAfter} from '@blinkk/root-cms';
import {GUIDES, buildGuideFields, listGuideScenes} from './guides_content.ts';
import {readScreenshots} from './screenshots_map.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const COLLECTION = 'Guides';
/** Recorded as the doc's `modifiedBy`. */
const MODIFIED_BY = 'seed_guides.ts';

interface Args {
  guides: string[];
  force: boolean;
  dryRun: boolean;
}

/** Parses `--guide`, `--force` and `--dry-run` flags from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {guides: [], force: false, dryRun: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    if (flag === '--guide') {
      const slug = inlineValue ?? argv[++i];
      if (!GUIDES.some((guide) => guide.slug === slug)) {
        const slugs = GUIDES.map((guide) => guide.slug).join(', ');
        throw new Error(`unknown guide "${slug}". options: ${slugs}`);
      }
      args.guides.push(slug);
    } else if (flag === '--force') {
      args.force = true;
    } else if (flag === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const screenshots = await readScreenshots();

  const missing = listGuideScenes().filter((id) => !screenshots[id]);
  if (missing.length > 0) {
    console.warn(
      `warning: no uploaded screenshot for scene(s): ${missing.join(', ')}. ` +
        'run screenshots_render.ts and screenshots_upload.ts to add them.'
    );
  }

  const selected = GUIDES.filter(
    (guide) => args.guides.length === 0 || args.guides.includes(guide.slug)
  );
  // Round-trip through JSON to drop `undefined` values (e.g. images that
  // haven't been uploaded yet), which Firestore rejects.
  const docs = selected.map((guide) => ({
    slug: guide.slug,
    fields: JSON.parse(JSON.stringify(buildGuideFields(guide, screenshots))),
  }));

  if (args.dryRun) {
    const output = Object.fromEntries(
      docs.map((doc) => [`${COLLECTION}/${doc.slug}`, doc.fields])
    );
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  let lastSortKey = await getLastSortKey(client);
  for (const doc of docs) {
    const docId = `${COLLECTION}/${doc.slug}`;
    const existing = await client.getRawDoc(COLLECTION, doc.slug, {
      mode: 'draft',
    });
    if (existing) {
      if (!args.force) {
        console.log(`skipped ${docId} (already exists, pass --force)`);
        continue;
      }
      const backupPath = path.join(
        os.tmpdir(),
        `${COLLECTION}--${doc.slug}.${Date.now()}.json`
      );
      await writeFile(backupPath, JSON.stringify(existing, null, 2));
      console.log(`backed up existing draft to ${backupPath}`);
    }
    // `saveDraftData()` keeps the existing `sys`, including `sys.sortKey`.
    await client.saveDraftData(docId, doc.fields, {modifiedBy: MODIFIED_BY});
    console.log(`saved draft: ${docId} (preview: /guides/${doc.slug}/)`);
    if (!existing?.sys?.sortKey) {
      lastSortKey = generateKeyAfter(lastSortKey);
      await client
        .dbDocRef(COLLECTION, doc.slug, {mode: 'draft'})
        .update({'sys.sortKey': lastSortKey});
    }
  }
}

/** Returns the largest `sys.sortKey` among the collection's drafts. */
async function getLastSortKey(client: RootCMSClient): Promise<string | null> {
  const res = await client.listDocs<any>(COLLECTION, {
    mode: 'draft',
    orderBy: 'sys.sortKey',
    orderByDirection: 'desc',
    limit: 1,
    raw: true,
  });
  return res.docs[0]?.sys?.sortKey || null;
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
