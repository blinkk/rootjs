/**
 * @fileoverview Proposes the refreshed copy for the `Docs` collection as a CMS
 * change proposal, so the rewrite can be reviewed in a pull request before it
 * is written to the CMS.
 *
 * The new copy lives in `docs_copy_content.ts`. For each doc that changed, the
 * script records a `doc.edit` with a `set` op per top-level field (e.g.
 * `meta.title`, `content.sections`), using the current draft as `before`.
 *
 * Run from the `docs/` dir:
 *
 *   node scripts/propose_docs_copy.ts               # write the proposal
 *   node scripts/propose_docs_copy.ts --id <id>     # custom proposal id
 *   node scripts/propose_docs_copy.ts --only index,cms
 *   node scripts/propose_docs_copy.ts --assign-order
 *
 * `--only` limits the proposal to the listed doc slugs, so a change to a few
 * pages doesn't sweep in unrelated edits made in the CMS since the last run.
 *
 * The proposal is written to `cms-proposals/<id>.yaml` and checked against the
 * collection schema (a dry run of `proposal.apply`). Once it's approved, apply
 * it with:
 *
 *   npx root-cms proposal.apply cms-proposals/<id>.yaml
 *
 * The writes are attributed to the active gcloud account. Pass
 * `--modified-by <email>` to attribute them to someone else.
 *
 * Proposals can't set `sys` values, so the sidebar order (`sys.sortKey`, see
 * the collection's `customSorting` option) is not part of the proposal. Pass
 * `--assign-order` to write the order from `DOCS_ORDER` to the drafts directly.
 * It only touches `sys.sortKey`, and docs need to be published for the new
 * order to show on the live site.
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {
  RootCMSClient,
  applyProposal,
  generateNKeysBetween,
  parseProposal,
  serializeProposal,
  type Proposal,
  type ProposalChange,
  type ProposalOp,
} from '@blinkk/root-cms';
import {DOCS_COPY, DOCS_ORDER, type DocCopy} from './docs_copy_content.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const PROPOSALS_DIR = path.join(DOCS_DIR, 'cms-proposals');
const COLLECTION = 'Docs';
/** Recorded as the proposal's `author`. */
const AUTHOR = 'scripts/propose_docs_copy.ts';

interface Args {
  id: string;
  assignOrder: boolean;
  /** Doc slugs to include. Empty means every doc in `DOCS_COPY`. */
  only: string[];
}

/** Parses `--id`, `--only` and `--assign-order` flags from argv. */
function parseArgs(argv: string[]): Args {
  const today = new Date().toISOString().slice(0, 10);
  const args: Args = {
    id: `${today}-docs-copy-refresh`,
    assignOrder: false,
    only: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split('=');
    if (flag === '--id') {
      const id = inlineValue ?? argv[++i];
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        throw new Error(`invalid --id value: ${arg}`);
      }
      args.id = id;
    } else if (flag === '--only') {
      const value = inlineValue ?? argv[++i];
      const slugs = (value || '').split(',').filter(Boolean);
      const unknown = slugs.filter(
        (slug) => !DOCS_COPY.some((doc) => doc.slug === slug)
      );
      if (slugs.length === 0 || unknown.length > 0) {
        throw new Error(`invalid --only value: ${arg}`);
      }
      args.only = slugs;
    } else if (flag === '--assign-order') {
      args.assignOrder = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

/** Field paths that the proposal sets, relative to the doc's `fields`. */
const FIELD_PATHS = [
  'meta.title',
  'meta.description',
  'meta.category',
  'meta.navLabel',
  'content.title',
  'content.body',
  'content.reference',
  'content.sections',
] as const;

function getPath(obj: any, dottedPath: string) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], obj);
}

/**
 * Removes values the CMS adds on save (array keys, rich text block ids, rich
 * text timestamps) and sorts object keys, so current and proposed values can
 * be compared.
 */
function normalize(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      if (key === '_arrayKey' || key === 'time') {
        continue;
      }
      // Rich text block ids.
      if (key === 'id' && typeof child === 'string' && 'type' in value) {
        continue;
      }
      out[key] = normalize(child);
    }
    return out;
  }
  return value;
}

function isEqual(a: any, b: any) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** Builds the `doc.edit` (or `doc.create`) change for one doc. */
function buildChange(
  doc: DocCopy,
  currentFields: Record<string, any> | null
): ProposalChange | null {
  const docId = `${COLLECTION}/${doc.slug}`;
  // Round-trip through JSON to drop `undefined` values.
  const fields = JSON.parse(JSON.stringify(doc.fields));
  if (!currentFields) {
    return {kind: 'doc.create', docId, note: doc.note, after: fields};
  }
  const ops: ProposalOp[] = [];
  for (const fieldPath of FIELD_PATHS) {
    const after = getPath(fields, fieldPath);
    if (after === undefined) {
      continue;
    }
    const before = getPath(currentFields, fieldPath);
    if (isEqual(before, after)) {
      continue;
    }
    ops.push({op: 'set', path: fieldPath, before: before ?? null, after});
  }
  if (ops.length === 0) {
    return null;
  }
  return {kind: 'doc.edit', docId, note: doc.note, ops};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootConfig = await loadRootConfig(DOCS_DIR, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);

  const docs =
    args.only.length > 0
      ? DOCS_COPY.filter((doc) => args.only.includes(doc.slug))
      : DOCS_COPY;
  const changes: ProposalChange[] = [];
  for (const doc of docs) {
    const current = await client.getDoc(COLLECTION, doc.slug, {mode: 'draft'});
    const change = buildChange(doc, current?.fields || null);
    if (change) {
      changes.push(change);
      console.log(`${change.kind}: ${COLLECTION}/${doc.slug}`);
    } else {
      console.log(`unchanged: ${COLLECTION}/${doc.slug}`);
    }
  }

  if (changes.length > 0) {
    const proposal: Proposal = {
      version: 1,
      id: args.id,
      title:
        args.only.length > 0
          ? `Update the developer docs: ${args.only.join(', ')}`
          : 'Refresh the developer docs copy',
      author: AUTHOR,
      generated: new Date().toISOString(),
      summary:
        args.only.length > 0
          ? summarizeNotes(changes)
          : [
              'Refreshes the copy across the developer docs:',
              '- Refers to the product as "Root.js", with the CMS as one of its',
              '  features, instead of a separate "Root CMS" product.',
              '- Folds the CMS setup steps into "Getting started", and turns the',
              '  old setup page into a CMS configuration page.',
              '- Updates the onboarding steps for the current `create-root` flow.',
              '- Raises the Node.js requirement to v24 (the current LTS).',
              '- Sets a sidebar category on every doc.',
            ].join('\n'),
      changes,
    };
    const yaml = serializeProposal(proposal);
    const parsed = parseProposal(yaml);
    if (!parsed.ok) {
      throw new Error(`invalid proposal: ${JSON.stringify(parsed.errors)}`);
    }
    // Resolves every change against the current drafts and the collection
    // schema, without writing anything.
    const dryRun = await applyProposal(client, proposal, {dryRun: true});
    if (!dryRun.ok) {
      throw new Error(`proposal failed: ${JSON.stringify(dryRun.errors)}`);
    }
    await mkdir(PROPOSALS_DIR, {recursive: true});
    const outPath = path.join(PROPOSALS_DIR, `${proposal.id}.yaml`);
    await writeFile(outPath, yaml);
    console.log(`wrote ${path.relative(DOCS_DIR, outPath)}`);
    console.log(
      `apply: npx root-cms proposal.apply ${path.relative(DOCS_DIR, outPath)}`
    );
  } else {
    console.log('no changes to propose');
  }

  if (args.assignOrder) {
    await assignOrder(client);
  }
}

/** Lists each change's note, for proposals limited with `--only`. */
function summarizeNotes(changes: ProposalChange[]): string {
  return changes
    .map(
      (change) =>
        `- ${'docId' in change ? change.docId : change.kind}: ${change.note || ''}`
    )
    .join('\n');
}

/**
 * Writes `sys.sortKey` to each draft in `DOCS_ORDER`, so the sidebar lists the
 * docs in that order. Docs that don't exist yet are skipped.
 */
async function assignOrder(client: RootCMSClient) {
  const keys = generateNKeysBetween(null, null, DOCS_ORDER.length);
  for (let i = 0; i < DOCS_ORDER.length; i++) {
    const slug = DOCS_ORDER[i];
    const existing = await client.getRawDoc(COLLECTION, slug, {mode: 'draft'});
    if (!existing) {
      console.log(`skipped order for ${COLLECTION}/${slug} (no draft yet)`);
      continue;
    }
    await client
      .dbDocRef(COLLECTION, slug, {mode: 'draft'})
      .update({'sys.sortKey': keys[i]});
  }
  console.log(`assigned sidebar order to ${DOCS_ORDER.length} docs`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
