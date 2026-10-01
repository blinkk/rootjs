/**
 * @fileoverview Seeds the `Sandbox/index` draft with the redesigned landing
 * page, so it can be reviewed and edited in the CMS at `/sandbox/`.
 *
 * The copy and module layout live in `sandbox_index_content.ts`. Images come
 * from `screenshots/screenshots.json` (see `screenshots_render.ts` and
 * `screenshots_upload.ts`); modules whose screenshot hasn't been uploaded yet
 * are seeded without an image.
 *
 * Run from the `docs/` dir:
 *
 *   node scripts/seed_sandbox_index.ts --dry-run   # print the fields as JSON
 *   node scripts/seed_sandbox_index.ts             # create Sandbox/index
 *   node scripts/seed_sandbox_index.ts --force     # overwrite an existing draft
 *   node scripts/seed_sandbox_index.ts --slug landing-v2
 *
 * By default the script refuses to overwrite an existing draft, so edits made
 * in the CMS aren't lost. With `--force`, the previous draft is first backed up
 * to a JSON file in the OS temp dir.
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {buildSandboxIndexFields} from './sandbox_index_content.ts';
import {readScreenshots} from './screenshots_map.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const COLLECTION = 'Sandbox';
/** Recorded as the doc's `modifiedBy`. */
const MODIFIED_BY = 'seed_sandbox_index.ts';

interface Args {
  slug: string;
  force: boolean;
  dryRun: boolean;
}

/** Parses `--slug`, `--force` and `--dry-run` flags from argv. */
function parseArgs(argv: string[]): Args {
  const args: Args = {slug: 'index', force: false, dryRun: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    if (flag === '--slug') {
      const slug = inlineValue ?? argv[++i];
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        throw new Error(`invalid --slug value: ${arg}`);
      }
      args.slug = slug;
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
  const docId = `${COLLECTION}/${args.slug}`;
  const screenshots = await readScreenshots();
  // Round-trip through JSON to drop `undefined` values (e.g. images that
  // haven't been uploaded yet), which Firestore rejects.
  const fields = JSON.parse(
    JSON.stringify(buildSandboxIndexFields(screenshots))
  );

  // Modules that are designed around a screenshot.
  const missing = fields.content.modules
    .filter(
      (m: any) => m._type === 'TemplateFeatureSpotlight' || m.id === 'hero'
    )
    .filter((m: any) => !m.image)
    .map((m: any) => m.id);
  if (missing.length > 0) {
    console.warn(
      `warning: no screenshot for module(s): ${missing.join(', ')}. ` +
        'run screenshots_render.ts and screenshots_upload.ts to add them.'
    );
  }

  if (args.dryRun) {
    console.log(JSON.stringify(fields, null, 2));
    return;
  }

  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const existing = await client.getRawDoc(COLLECTION, args.slug, {
    mode: 'draft',
  });
  if (existing) {
    if (!args.force) {
      throw new Error(`${docId} already exists. pass --force to overwrite it.`);
    }
    const backupPath = path.join(
      os.tmpdir(),
      `${COLLECTION}--${args.slug}.${Date.now()}.json`
    );
    await writeFile(backupPath, JSON.stringify(existing, null, 2));
    console.log(`backed up existing draft to ${backupPath}`);
  }

  await client.saveDraftData(docId, fields, {modifiedBy: MODIFIED_BY});
  console.log(`saved draft: ${docId}`);
  console.log(
    `preview: /sandbox/${args.slug === 'index' ? '' : `${args.slug}/`}`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
