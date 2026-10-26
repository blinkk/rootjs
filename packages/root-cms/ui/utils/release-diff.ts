/**
 * Release diffs.
 *
 * Computes the content changes made by the docs in a release. For a release
 * that hasn't been published yet, each doc's published version is compared to
 * its draft (i.e. what publishing the release would change). For a published
 * release, each doc's pre-release state (from the release's rollback
 * snapshots) is compared to its current published version (i.e. what the
 * release changed).
 */

import * as schema from '../../core/schema.js';
import {getReleaseRollbackSnapshotKey} from '../../shared/release-rollback.js';
import {fetchCollectionSchema} from './collection.js';
import {
  DocChange,
  diffDocFields,
  richTextToPlainText,
  testTimestamp,
  toMillis,
} from './doc-changes.js';
import {LocalesDiff, diffDocLocales} from './doc-diff.js';
import {CMSDoc, getDraftDocs, getPublishedDocs, unmarshalData} from './doc.js';
import {isObject, stableJsonStringify} from './objects.js';
import {listReleaseRollbackSnapshots} from './release-rollback.js';
import {Release} from './release.js';

/**
 * `pending` compares the published docs to the drafts. `released` compares
 * the pre-release snapshots to the published docs.
 */
export type ReleaseDiffMode = 'pending' | 'released';

export type ReleaseDocDiffStatus =
  'added' | 'removed' | 'modified' | 'unchanged' | 'missing';

/** The changes to a single doc in a release. */
export interface ReleaseDocDiff {
  docId: string;
  /**
   * `added` if the doc didn't exist before, `removed` if it doesn't exist
   * after, `unchanged` if the versions are identical, and `missing` if the doc
   * doesn't exist in either version.
   */
  status: ReleaseDocDiffStatus;
  before: CMSDoc | null;
  after: CMSDoc | null;
  /** Field changes labeled using the collection schema. */
  changes: DocChange[];
  /** Locales added or removed, or `null` if unchanged. */
  locales: LocalesDiff | null;
  /**
   * Whether the fields differ. A doc can have field differences but no
   * `changes` when only hidden data changed (e.g. editor metadata).
   */
  fieldsChanged: boolean;
}

/** The changes to every doc in a release. */
export interface ReleaseDiff {
  releaseId: string;
  mode: ReleaseDiffMode;
  docs: ReleaseDocDiff[];
}

/** Returns the diff mode used for a release. */
export function getReleaseDiffMode(release: Release): ReleaseDiffMode {
  return release.publishedAt ? 'released' : 'pending';
}

/** Returns labels for the before and after versions of a release diff. */
export function getReleaseDiffLabels(mode: ReleaseDiffMode): {
  before: string;
  after: string;
} {
  if (mode === 'released') {
    return {before: 'before release', after: 'published'};
  }
  return {before: 'published', after: 'draft'};
}

/**
 * Loads the before and after versions of every doc in a release and diffs
 * them.
 *
 * ```ts
 * const diff = await getReleaseDiff(release);
 * diff.docs.filter((doc) => doc.status !== 'unchanged');
 * ```
 */
export async function getReleaseDiff(release: Release): Promise<ReleaseDiff> {
  const docIds = release.docIds || [];
  const mode = getReleaseDiffMode(release);
  const versions = await loadDocVersions(release, mode, docIds);
  const collections = await loadCollections(docIds);
  const docs = docIds.map((docId) => {
    const {before, after} = versions[docId];
    const collectionId = docId.split('/')[0];
    return diffDoc(docId, before, after, collections[collectionId] || null);
  });
  return {releaseId: release.id, mode, docs};
}

async function loadDocVersions(
  release: Release,
  mode: ReleaseDiffMode,
  docIds: string[]
): Promise<Record<string, {before: CMSDoc | null; after: CMSDoc | null}>> {
  const versions: Record<
    string,
    {before: CMSDoc | null; after: CMSDoc | null}
  > = {};
  if (docIds.length === 0) {
    return versions;
  }
  if (mode === 'released') {
    const [snapshots, publishedDocs] = await Promise.all([
      listReleaseRollbackSnapshots(release.id),
      getPublishedDocs(docIds),
    ]);
    for (const docId of docIds) {
      const snapshot = snapshots[getReleaseRollbackSnapshotKey('doc', docId)];
      const after = publishedDocs[docId] || null;
      // Without a snapshot (e.g. the release was published before rollbacks
      // were supported), the pre-release state is unknown, so the doc is
      // compared to itself.
      const before = snapshot ? (snapshot.previous as CMSDoc | null) : after;
      versions[docId] = {before, after};
    }
    return versions;
  }
  const [publishedDocs, draftDocs] = await Promise.all([
    getPublishedDocs(docIds),
    getDraftDocs(docIds),
  ]);
  for (const docId of docIds) {
    versions[docId] = {
      before: publishedDocs[docId] || null,
      after: draftDocs[docId] || null,
    };
  }
  return versions;
}

/**
 * Fetches the schemas used to label the changes. Without a schema, changes
 * are still computed but labeled by their raw field keys.
 */
async function loadCollections(
  docIds: string[]
): Promise<Record<string, schema.Collection>> {
  const collectionIds = Array.from(
    new Set(docIds.map((docId) => docId.split('/')[0]))
  );
  const collections: Record<string, schema.Collection> = {};
  await Promise.all(
    collectionIds.map(async (collectionId) => {
      try {
        collections[collectionId] = await fetchCollectionSchema(collectionId);
      } catch (err) {
        console.warn(`failed to load schema for ${collectionId}`, err);
      }
    })
  );
  return collections;
}

function diffDoc(
  docId: string,
  before: CMSDoc | null,
  after: CMSDoc | null,
  collection: schema.Collection | null
): ReleaseDocDiff {
  const fieldsChanged =
    stableJsonStringify(cleanFields(before)) !==
    stableJsonStringify(cleanFields(after));
  const locales = before && after ? diffDocLocales(before, after) : null;
  const changes = fieldsChanged
    ? diffDocFields(collection, before?.fields, after?.fields)
    : [];
  let status: ReleaseDocDiffStatus;
  if (!before && !after) {
    status = 'missing';
  } else if (!before) {
    status = 'added';
  } else if (!after) {
    status = 'removed';
  } else if (fieldsChanged || locales) {
    status = 'modified';
  } else {
    status = 'unchanged';
  }
  return {docId, status, before, after, changes, locales, fieldsChanged};
}

function cleanFields(doc: CMSDoc | null) {
  return unmarshalData(doc?.fields || {}, {removeArrayKey: true});
}

/** Max length of a string value sent to the AI model. */
const MAX_MODEL_STRING_LENGTH = 2000;

/**
 * Shapes a release diff for the Root AI model: values are converted to plain
 * JSON (rich text to plain text, timestamps to ISO strings) and long values
 * are truncated.
 */
export function serializeReleaseDiffForModel(diff: ReleaseDiff) {
  const labels = getReleaseDiffLabels(diff.mode);
  return {
    releaseId: diff.releaseId,
    comparison: `${labels.before} -> ${labels.after}`,
    docs: diff.docs.map((doc) => ({
      docId: doc.docId,
      status: doc.status,
      before: serializeSys(doc.before),
      after: serializeSys(doc.after),
      localesAdded: doc.locales?.added,
      localesRemoved: doc.locales?.removed,
      changes: doc.changes.map(serializeChange),
      hiddenDataChanged:
        doc.fieldsChanged && doc.changes.length === 0 ? true : undefined,
    })),
  };
}

function serializeSys(doc: CMSDoc | null) {
  const sys: any = doc?.sys;
  if (!sys) {
    return null;
  }
  return {
    modifiedAt: toIsoString(sys.modifiedAt),
    modifiedBy: sys.modifiedBy,
    publishedAt: toIsoString(sys.publishedAt),
    publishedBy: sys.publishedBy,
  };
}

function serializeChange(change: DocChange): Record<string, any> {
  const result: Record<string, any> = {
    type: change.type,
    path: change.path.join(' > ') || change.deepKey,
  };
  if (change.before !== undefined) {
    result.before = toModelValue(change.before);
  }
  if (change.after !== undefined) {
    result.after = toModelValue(change.after);
  }
  if (change.children && change.children.length > 0) {
    result.children = change.children.map(serializeChange);
  }
  return result;
}

function toModelValue(value: any): any {
  if (testTimestamp(value)) {
    return toIsoString(value);
  }
  if (isObject(value) && Array.isArray(value.blocks)) {
    return truncate(richTextToPlainText(value));
  }
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (Array.isArray(value)) {
    return value.map(toModelValue);
  }
  if (isObject(value)) {
    const data = unmarshalData(value, {removeArrayKey: true});
    const json = JSON.stringify(data);
    return json.length > MAX_MODEL_STRING_LENGTH ? truncate(json) : data;
  }
  return value;
}

function toIsoString(value: any): string | undefined {
  if (!value || !testTimestamp(value)) {
    return undefined;
  }
  return new Date(toMillis(value)).toISOString();
}

function truncate(str: string): string {
  if (str.length <= MAX_MODEL_STRING_LENGTH) {
    return str;
  }
  return `${str.slice(0, MAX_MODEL_STRING_LENGTH)}… [truncated]`;
}

/**
 * Generates a short markdown summary of a release's changes with Root AI.
 */
export async function cmsGetReleaseSummary(
  release: Release,
  diff: ReleaseDiff
): Promise<string> {
  const res = await window.fetch('/cms/api/ai.release_summary', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      releaseId: release.id,
      description: release.description || '',
      diff: serializeReleaseDiffForModel(diff),
    }),
  });
  let resData: any = null;
  try {
    resData = await res.json();
  } catch {
    // Ignore JSON parsing errors and fall back to the status code below.
  }
  if (!res.ok || !resData?.success) {
    throw new Error(
      resData?.error || `Failed to summarize the release: ${res.status}`
    );
  }
  return String(resData.summary || '');
}
