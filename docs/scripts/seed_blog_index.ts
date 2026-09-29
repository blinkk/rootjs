/**
 * @fileoverview Seeds the `Pages/blog` draft with the `/blog/` index page,
 * so its meta tags and header copy can be edited in the CMS. The post list is
 * rendered by the `TemplateBlogPosts` module from the `BlogPosts` collection.
 *
 * Run from the `docs/` dir:
 *
 *   node scripts/seed_blog_index.ts --dry-run   # print the fields as JSON
 *   node scripts/seed_blog_index.ts             # create Pages/blog
 *   node scripts/seed_blog_index.ts --force     # overwrite an existing draft
 *
 * By default the script refuses to overwrite an existing draft, so edits made
 * in the CMS aren't lost. With `--force`, the previous draft is first backed up
 * to a JSON file in the OS temp dir.
 *
 * The doc is saved as a draft only; publish it in the CMS so the page is
 * served at `/blog/`.
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

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const COLLECTION = 'Pages';
const SLUG = 'blog';
/** Recorded as the doc's `modifiedBy`. */
const MODIFIED_BY = 'seed_blog_index.ts';

/** Builds a rich text value from one or more paragraphs of inline HTML. */
function richtext(...paragraphs: string[]) {
  return {
    blocks: paragraphs.map((text) => ({type: 'paragraph', data: {text}})),
    time: Date.now(),
    version: '2.28.2',
  };
}

const FIELDS = {
  meta: {
    title: 'Blog – Root.js',
    description:
      'Release notes, feature deep dives, and updates from the team building Root.js and Root CMS.',
  },
  content: {
    modules: [
      {
        _type: 'TemplateBlogPosts',
        id: 'blog',
        eyebrow: 'Root.js blog',
        title: 'News and updates from the Root.js team',
        body: richtext(
          'Release notes, feature deep dives, and a look at what we’re building next for Root.js and Root CMS.'
        ),
      },
    ],
  },
};

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const docId = `${COLLECTION}/${SLUG}`;

  if (args.dryRun) {
    console.log(JSON.stringify(FIELDS, null, 2));
    return;
  }

  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const existing = await client.getRawDoc(COLLECTION, SLUG, {mode: 'draft'});
  if (existing) {
    if (!args.force) {
      throw new Error(`${docId} already exists. pass --force to overwrite it.`);
    }
    const backupPath = path.join(
      os.tmpdir(),
      `${COLLECTION}--${SLUG}.${Date.now()}.json`
    );
    await writeFile(backupPath, JSON.stringify(existing, null, 2));
    console.log(`backed up existing draft to ${backupPath}`);
  }

  await client.saveDraftData(docId, FIELDS, {modifiedBy: MODIFIED_BY});
  console.log(`saved draft: ${docId}`);
  console.log(`preview: /${SLUG}/?preview=true`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
