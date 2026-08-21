/**
 * Applies a CMS change proposal to the database.
 *
 * Runs in two phases: every change is first resolved against current data and
 * validated against the collection schema, and only if *all* of them resolve
 * cleanly is anything written. This matches the group-rejection semantics of
 * the `doc_edit` AI tool — a proposal never lands half-applied because of a
 * mistake in a later change.
 *
 * Applying only ever writes drafts, release contents, and draft translations.
 * It never publishes, schedules, or deletes anything.
 *
 * Usage:
 * ```
 * const res = await applyProposal(cmsClient, proposal, {dryRun: true});
 * res.changes.forEach((c) => console.log(c.kind, c.summary));
 * ```
 */
import {Proposal, ProposalOp, toDocEditOperations} from '../shared/proposal.js';
import {RootCMSClient, unmarshalData} from './client.js';
import {applyDocEdits, type DocEditOperation} from './doc-edits.js';
import type {MultiLocaleTranslationsMap} from './translations-manager.js';
import {validateFields} from './validation.js';

/** A problem that prevented a change from being applied. */
export interface ProposalApplyError {
  /** Zero-based index of the change in `proposal.changes`. */
  changeIndex: number;
  kind: string;
  /** The target of the change, e.g. a doc id or release id. */
  target: string;
  message: string;
  /** Dotted field path, when the failure is tied to one. */
  path?: string;
  expected?: string;
  received?: any;
}

/** One resolved change, ready to be written (or reported by a dry run). */
export interface ResolvedChange {
  changeIndex: number;
  kind: string;
  target: string;
  /** Short human-readable description of what will be written. */
  summary: string;
  /** Field paths the change touches, for doc and release changes. */
  paths?: string[];
}

export type ApplyProposalResult =
  | {ok: true; dryRun: boolean; changes: ResolvedChange[]}
  | {ok: false; errors: ProposalApplyError[]};

export interface ApplyProposalOptions {
  /** Resolve and validate everything, but write nothing. */
  dryRun?: boolean;
  /**
   * Also check each op's recorded `before` against the value currently in the
   * database and fail on drift. Off by default: `before` is documentation for
   * the human reviewing the proposal, not a precondition.
   */
  verifyBefore?: boolean;
  /** Attributed as the author of the writes. */
  modifiedBy?: string;
  /** Skip schema validation of the resulting doc fields. */
  skipValidation?: boolean;
}

/** A write staged during phase one and committed during phase two. */
type StagedWrite =
  | {type: 'doc'; docId: string; fields: Record<string, any>}
  | {type: 'release'; releaseId: string; release: Record<string, any>}
  | {
      type: 'translations';
      translationsId: string;
      strings: MultiLocaleTranslationsMap;
    };

/**
 * Resolves and (unless `dryRun`) applies every change in a proposal.
 */
export async function applyProposal(
  cmsClient: RootCMSClient,
  proposal: Proposal,
  options?: ApplyProposalOptions
): Promise<ApplyProposalResult> {
  const errors: ProposalApplyError[] = [];
  const resolved: ResolvedChange[] = [];
  const writes: StagedWrite[] = [];

  // Phase one: resolve and validate. Doc results are threaded through
  // `pendingDocs` so that two changes targeting the same doc compose instead
  // of the second one clobbering the first.
  const pendingDocs = new Map<string, Record<string, any>>();

  for (let i = 0; i < proposal.changes.length; i++) {
    const change = proposal.changes[i];
    try {
      switch (change.kind) {
        case 'doc.edit': {
          const fields = await readPendingDocFields(
            cmsClient,
            pendingDocs,
            change.docId
          );
          if (fields === null) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.docId,
              message: `Doc "${change.docId}" does not exist.`,
            });
            break;
          }
          if (options?.verifyBefore) {
            const drift = findBeforeDrift(fields, change.ops);
            if (drift) {
              errors.push({
                changeIndex: i,
                kind: change.kind,
                target: change.docId,
                message:
                  "The current value no longer matches the proposal's `before` value.",
                path: drift.path,
                expected: JSON.stringify(drift.expected),
                received: drift.received,
              });
              break;
            }
          }
          const applied = applyDocEdits(
            fields,
            toDocEditOperations(change.ops) as DocEditOperation[]
          );
          if (!applied.ok) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.docId,
              message: applied.error.message,
              path: applied.error.path,
              expected: applied.error.expected,
              received: applied.error.received,
            });
            break;
          }
          const invalid = await validateAgainstSchema(
            cmsClient,
            change.docId,
            applied.fields,
            options
          );
          if (invalid) {
            errors.push({changeIndex: i, kind: change.kind, ...invalid});
            break;
          }
          pendingDocs.set(change.docId, applied.fields);
          writes.push({
            type: 'doc',
            docId: change.docId,
            fields: applied.fields,
          });
          resolved.push({
            changeIndex: i,
            kind: change.kind,
            target: change.docId,
            summary: `${change.ops.length} field ${
              change.ops.length === 1 ? 'edit' : 'edits'
            } to the draft`,
            paths: change.ops.map((op) => op.path),
          });
          break;
        }

        case 'doc.create': {
          const existing = await readPendingDocFields(
            cmsClient,
            pendingDocs,
            change.docId
          );
          if (existing !== null) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.docId,
              message: `Doc "${change.docId}" already exists; use doc.edit instead.`,
            });
            break;
          }
          const invalid = await validateAgainstSchema(
            cmsClient,
            change.docId,
            change.after,
            options
          );
          if (invalid) {
            errors.push({changeIndex: i, kind: change.kind, ...invalid});
            break;
          }
          pendingDocs.set(change.docId, change.after);
          writes.push({
            type: 'doc',
            docId: change.docId,
            fields: change.after,
          });
          resolved.push({
            changeIndex: i,
            kind: change.kind,
            target: change.docId,
            summary: 'create a new draft',
            paths: Object.keys(change.after),
          });
          break;
        }

        case 'doc.duplicate': {
          const source = await readPendingDocFields(
            cmsClient,
            pendingDocs,
            change.fromDocId
          );
          if (source === null) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.fromDocId,
              message: `Source doc "${change.fromDocId}" does not exist.`,
            });
            break;
          }
          const target = await readPendingDocFields(
            cmsClient,
            pendingDocs,
            change.toDocId
          );
          if (target !== null) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.toDocId,
              message: `Target doc "${change.toDocId}" already exists.`,
            });
            break;
          }
          const fields = structuredClone(source);
          pendingDocs.set(change.toDocId, fields);
          writes.push({type: 'doc', docId: change.toDocId, fields});
          resolved.push({
            changeIndex: i,
            kind: change.kind,
            target: change.toDocId,
            summary: `duplicate of ${change.fromDocId}`,
          });
          break;
        }

        case 'release.create':
        case 'release.update': {
          const existing = await cmsClient.getRelease(change.releaseId);
          if (change.kind === 'release.create' && existing) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.releaseId,
              message: `Release "${change.releaseId}" already exists.`,
            });
            break;
          }
          if (change.kind === 'release.update' && !existing) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.releaseId,
              message: `Release "${change.releaseId}" does not exist.`,
            });
            break;
          }
          if (existing?.publishedAt) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.releaseId,
              message: `Release "${change.releaseId}" has already been published and cannot be edited.`,
            });
            break;
          }
          if (existing?.scheduledAt) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.releaseId,
              message: `Release "${change.releaseId}" is scheduled; unschedule it in the CMS UI before editing.`,
            });
            break;
          }
          // A release is a plain object, so the doc op vocabulary applies
          // directly to its `description` / `docIds` / `dataSourceIds`.
          const base: Record<string, any> = {
            description: existing?.description ?? '',
            docIds: existing?.docIds ?? [],
            dataSourceIds: existing?.dataSourceIds ?? [],
          };
          const applied = applyDocEdits(
            base,
            toDocEditOperations(change.ops) as DocEditOperation[]
          );
          if (!applied.ok) {
            errors.push({
              changeIndex: i,
              kind: change.kind,
              target: change.releaseId,
              message: applied.error.message,
              path: applied.error.path,
              expected: applied.error.expected,
              received: applied.error.received,
            });
            break;
          }
          writes.push({
            type: 'release',
            releaseId: change.releaseId,
            release: applied.fields,
          });
          resolved.push({
            changeIndex: i,
            kind: change.kind,
            target: change.releaseId,
            summary:
              change.kind === 'release.create'
                ? `create release with ${
                    (applied.fields.docIds || []).length
                  } doc(s)`
                : `update release to ${
                    (applied.fields.docIds || []).length
                  } doc(s)`,
            paths: change.ops.map((op) => op.path),
          });
          break;
        }

        case 'translations': {
          const strings: MultiLocaleTranslationsMap = {};
          let localeCount = 0;
          for (const entry of change.entries) {
            for (const [locale, value] of Object.entries(entry.locales)) {
              strings[entry.source] ??= {};
              strings[entry.source][locale] = value.after;
              localeCount++;
            }
          }
          writes.push({
            type: 'translations',
            translationsId: change.translationsId,
            strings,
          });
          resolved.push({
            changeIndex: i,
            kind: change.kind,
            target: change.translationsId,
            summary: `${change.entries.length} string(s) across ${localeCount} locale entries`,
          });
          break;
        }
      }
    } catch (err: any) {
      errors.push({
        changeIndex: i,
        kind: change.kind,
        target: changeTarget(change),
        message: err?.message || String(err),
      });
    }
  }

  if (errors.length > 0) {
    return {ok: false, errors};
  }
  if (options?.dryRun) {
    return {ok: true, dryRun: true, changes: resolved};
  }

  // Phase two: commit. Doc writes are collapsed so a doc touched by several
  // changes is saved once, with all of them applied.
  const docWrites = new Map<string, Record<string, any>>();
  for (const write of writes) {
    if (write.type === 'doc') {
      docWrites.set(write.docId, write.fields);
    }
  }
  for (const [docId, fields] of docWrites) {
    await cmsClient.saveDraftData(docId, fields, {
      modifiedBy: options?.modifiedBy,
    });
  }
  for (const write of writes) {
    if (write.type === 'release') {
      await cmsClient.setRelease(write.releaseId, write.release, {
        modifiedBy: options?.modifiedBy,
      });
    } else if (write.type === 'translations') {
      await cmsClient
        .getTranslationsManager()
        .saveTranslations(write.translationsId, write.strings, {
          modifiedBy: options?.modifiedBy,
        });
    }
  }

  return {ok: true, dryRun: false, changes: resolved};
}

/**
 * Reads a doc's draft fields, preferring the in-flight result of an earlier
 * change in the same proposal. Returns null if the doc does not exist.
 */
async function readPendingDocFields(
  cmsClient: RootCMSClient,
  pendingDocs: Map<string, Record<string, any>>,
  docId: string
): Promise<Record<string, any> | null> {
  if (pendingDocs.has(docId)) {
    return pendingDocs.get(docId)!;
  }
  const {collection, slug} = parseDocId(docId);
  const rawDoc = await cmsClient.getRawDoc(collection, slug, {mode: 'draft'});
  if (!rawDoc) {
    return null;
  }
  return unmarshalData(rawDoc.fields || {});
}

/**
 * Validates fields against the doc's collection schema. Returns a partial
 * error when validation fails, or null when it passes (or is skipped, or the
 * collection has no schema available).
 */
async function validateAgainstSchema(
  cmsClient: RootCMSClient,
  docId: string,
  fields: Record<string, any>,
  options?: ApplyProposalOptions
): Promise<Omit<ProposalApplyError, 'changeIndex' | 'kind'> | null> {
  if (options?.skipValidation) {
    return null;
  }
  const {collection} = parseDocId(docId);
  const schema = await cmsClient.getCollection(collection);
  if (!schema) {
    return null;
  }
  const validationErrors = validateFields(fields, schema);
  if (validationErrors.length === 0) {
    return null;
  }
  const first = validationErrors[0];
  return {
    target: docId,
    message:
      validationErrors.length === 1
        ? first.message
        : `${first.message} (and ${validationErrors.length - 1} more)`,
    path: first.path,
    expected: first.expected,
    received: first.received,
  };
}

/**
 * Returns the first op whose recorded `before` no longer matches the value in
 * the current data, or null when everything matches.
 */
function findBeforeDrift(
  fields: Record<string, any>,
  ops: ProposalOp[]
): {path: string; expected: any; received: any} | null {
  for (const op of ops) {
    if (!('before' in op) || op.op === 'insert_item') {
      continue;
    }
    const path = op.op === 'remove_item' ? `${op.path}.${op.index}` : op.path;
    const current = readPath(fields, path);
    const expected = op.before ?? undefined;
    if (!deepEqual(current, expected)) {
      return {path, expected: op.before, received: current};
    }
  }
  return null;
}

/** Reads a dotted path (with numeric array indices) out of plain JSON data. */
function readPath(data: any, path: string): any {
  let cursor = data;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    cursor = Array.isArray(cursor) ? cursor[Number(segment)] : cursor[segment];
  }
  return cursor;
}

/** Structural equality for plain JSON values. */
function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => deepEqual(a[key], b[key]));
}

/** Splits a "Collection/slug" doc id. */
function parseDocId(docId: string): {collection: string; slug: string} {
  const index = docId.indexOf('/');
  if (index <= 0 || index === docId.length - 1) {
    throw new Error(`invalid doc id: "${docId}" (expected "Collection/slug")`);
  }
  return {
    collection: docId.slice(0, index),
    slug: docId.slice(index + 1).replace(/\//g, '--'),
  };
}

/** Best-effort target label for a change, used in error reporting. */
function changeTarget(change: Proposal['changes'][number]): string {
  if ('docId' in change) return change.docId;
  if ('toDocId' in change) return change.toDocId;
  if ('releaseId' in change) return change.releaseId;
  if ('translationsId' in change) return change.translationsId;
  return '';
}
