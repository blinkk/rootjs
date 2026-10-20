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
 *   node scripts/propose_docs_copy.ts --assign-order --dry-run
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
 * It keeps every existing key that's already in order and only moves the docs
 * that are out of place or have no key yet, so as few docs as possible need to
 * be republished. Moved docs get a new `sys.modifiedAt`, so the CMS shows them
 * as having unpublished changes; publish them for the new order to show on the
 * live site. `--dry-run` prints the moves without writing them, and
 * `--modified-by <email>` sets who they're attributed to (defaults to
 * `ROOT_CMS_USER` or the active gcloud account).
 *
 * Requires application-default credentials for the project's Firestore, e.g.
 * `gcloud auth application-default login`.
 */

import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig} from '@blinkk/root/node';
import {
  RootCMSClient,
  applyProposal,
  compareSortKeys,
  generateNKeysBetween,
  parseProposal,
  serializeProposal,
  type Proposal,
  type ProposalChange,
  type ProposalOp,
} from '@blinkk/root-cms';
import {Timestamp} from 'firebase-admin/firestore';
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
  /** Prints the `--assign-order` moves without writing them. */
  dryRun: boolean;
  /** Email the `--assign-order` writes are attributed to. */
  modifiedBy?: string;
  /** Doc slugs to include. Empty means every doc in `DOCS_COPY`. */
  only: string[];
}

/** Parses the command-line flags from argv. */
function parseArgs(argv: string[]): Args {
  const today = new Date().toISOString().slice(0, 10);
  const args: Args = {
    id: `${today}-docs-copy-refresh`,
    assignOrder: false,
    dryRun: false,
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
    } else if (flag === '--dry-run') {
      args.dryRun = true;
    } else if (flag === '--modified-by') {
      const email = inlineValue ?? argv[++i];
      if (!email || !email.includes('@')) {
        throw new Error(`invalid --modified-by value: ${arg}`);
      }
      args.modifiedBy = email;
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
    await assignOrder(client, {
      dryRun: args.dryRun,
      modifiedBy: args.modifiedBy || getCliUser(),
    });
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
 * Returns the email writes are attributed to: `ROOT_CMS_USER`, or the active
 * gcloud account (the same lookup `root-cms proposal.apply` uses).
 */
function getCliUser(): string | undefined {
  const fromEnv =
    process.env.ROOT_CMS_USER?.trim() ||
    process.env.CLOUDSDK_CORE_ACCOUNT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const account = execFileSync('gcloud', ['config', 'get-value', 'account'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return account || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the indexes of the longest run of keys that are already in
 * increasing order (not necessarily adjacent), skipping missing keys. Those
 * docs can keep their keys; only the rest need to move.
 */
function findKeysInOrder(keys: Array<string | null>): Set<number> {
  // `tails[n]` is the index ending the best increasing run of length n + 1,
  // and `prev[i]` is the index before `i` in the run ending at `i`.
  const tails: number[] = [];
  const prev: number[] = new Array(keys.length).fill(-1);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) {
      continue;
    }
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareSortKeys(keys[tails[mid]]!, key) < 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const kept = new Set<number>();
  let i = tails.length > 0 ? tails[tails.length - 1] : -1;
  while (i !== -1) {
    kept.add(i);
    i = prev[i];
  }
  return kept;
}

/**
 * Writes `sys.sortKey` to the drafts in `DOCS_ORDER` that are out of place,
 * so the sidebar lists the docs in that order. Docs that don't exist yet are
 * skipped.
 */
async function assignOrder(
  client: RootCMSClient,
  options: {dryRun: boolean; modifiedBy?: string}
) {
  const slugs: string[] = [];
  const keys: Array<string | null> = [];
  for (const slug of DOCS_ORDER) {
    const existing = await client.getRawDoc(COLLECTION, slug, {mode: 'draft'});
    if (!existing) {
      console.log(`skipped order for ${COLLECTION}/${slug} (no draft yet)`);
      continue;
    }
    slugs.push(slug);
    keys.push(existing.sys?.sortKey || null);
  }

  // Keep the keys that are already in order, and generate new keys for each
  // run of docs between two kept keys.
  const kept = findKeysInOrder(keys);
  const newKeys = [...keys];
  let start = 0;
  while (start < slugs.length) {
    if (kept.has(start)) {
      start++;
      continue;
    }
    let end = start;
    while (end < slugs.length && !kept.has(end)) {
      end++;
    }
    const before = start > 0 ? newKeys[start - 1] : null;
    const after = end < slugs.length ? newKeys[end] : null;
    const generated = generateNKeysBetween(before, after, end - start);
    for (let i = start; i < end; i++) {
      newKeys[i] = generated[i - start];
    }
    start = end;
  }

  if (!options.dryRun && !options.modifiedBy) {
    throw new Error(
      'could not determine the user for --assign-order, pass --modified-by'
    );
  }
  let moved = 0;
  for (let i = 0; i < slugs.length; i++) {
    if (newKeys[i] === keys[i]) {
      continue;
    }
    moved++;
    const docId = `${COLLECTION}/${slugs[i]}`;
    console.log(`order: ${docId} ${keys[i] || '(none)'} -> ${newKeys[i]}`);
    if (options.dryRun) {
      continue;
    }
    // Like reordering in the CMS, bump `modifiedAt` so the doc shows as having
    // unpublished changes.
    await client.dbDocRef(COLLECTION, slugs[i], {mode: 'draft'}).update({
      'sys.sortKey': newKeys[i],
      'sys.modifiedAt': Timestamp.now(),
      'sys.modifiedBy': options.modifiedBy,
    });
  }
  if (moved === 0) {
    console.log('sidebar order is up to date');
  } else if (options.dryRun) {
    console.log(`dry run: would move ${moved} doc(s)`);
  } else {
    console.log(
      `moved ${moved} doc(s), publish them for the new order to go live`
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
