/**
 * Client-side implementations of the CMS write tools declared in
 * `core/ai-tools.ts`. Each handler runs in the browser using the signed-in
 * user's Firebase credentials so writes flow through Firestore listeners
 * (other open CMS tabs see the change immediately) and trigger Firestore
 * security rule evaluation.
 *
 * Read tools (`doc_get`, `docs_list`, etc.) live server-side now — see the
 * `execute` blocks on the read tools in `core/ai-tools.ts`. The Vercel AI
 * SDK runs those in `streamText` directly and never invokes `onToolCall`
 * for them, so the large doc payloads they return do not round-trip
 * through the browser on every chat turn.
 */
import {
  deleteField,
  doc,
  Firestore,
  getDoc as fbGetDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import type {DocEditOperation} from '../../../core/ai-tools.js';
import {Collection} from '../../../core/schema.js';
import {
  marshalData,
  resolveArrayObjectPath,
  unmarshalData as unmarshalDataBase,
} from '../../../shared/marshal.js';
import {isSlugValid} from '../../../shared/slug.js';
import {fetchProjectRoles} from '../../hooks/useProjectRoles.js';
import {fetchCollectionSchema} from '../../utils/collection.js';
import {testCanPublish} from '../../utils/permissions.js';
import {
  Release,
  addRelease,
  getRelease as cmsGetRelease,
  updateRelease as cmsUpdateRelease,
} from '../../utils/release.js';

/** Lazily import the validators so we don't double-bundle them. */
type Validators = typeof import('../../../core/ai-tools.js');
let validatorsPromise: Promise<Validators> | null = null;
function loadValidators(): Promise<Validators> {
  if (!validatorsPromise) {
    validatorsPromise = import('../../../core/ai-tools.js');
  }
  return validatorsPromise;
}

export const WRITE_CMS_TOOL_NAMES = [
  'doc_set',
  'doc_create',
  'doc_updateField',
  'doc_edit',
  'doc_duplicate',
  'release_create',
  'release_update',
] as const;

export type CmsWriteToolName = (typeof WRITE_CMS_TOOL_NAMES)[number];

export interface CmsToolDetail {
  label: string;
  value: string;
}

export interface CmsToolReceipt {
  type: 'cms-write-receipt';
  title: string;
  summary: string;
  docId?: string;
  adminUrl?: string;
  /** Label for the `adminUrl` button. Defaults to "Open document". */
  linkLabel?: string;
  details: CmsToolDetail[];
}

export interface CmsToolPreview {
  toolName: CmsWriteToolName;
  title: string;
  summary: string;
  docId?: string;
  path?: string;
  before?: unknown;
  after?: unknown;
  details: CmsToolDetail[];
  /** Label for the approve button. Defaults to "Approve draft edit". */
  approveLabel?: string;
  error?: string;
  errors?: unknown[];
  hint?: string;
}

interface RootCtxLike {
  rootConfig: {projectId: string};
  firebase: {db: Firestore; user: {email?: string | null}};
}

export function isCmsWriteTool(toolName: string): toolName is CmsWriteToolName {
  return (WRITE_CMS_TOOL_NAMES as readonly string[]).includes(toolName);
}

function getCtx(): RootCtxLike {
  const w = window as any;
  return {
    rootConfig: w.__ROOT_CTX.rootConfig,
    firebase: w.firebase,
  };
}

function getDocAdminUrl(docId: string): string {
  const {collection, slug} = parseDocId(docId);
  return `/cms/content/${encodeURIComponent(collection)}/${encodeURIComponent(
    slug
  )}`;
}

function parseDocId(docId: string): {collection: string; slug: string} {
  const idx = docId.indexOf('/');
  if (idx <= 0 || idx === docId.length - 1) {
    throw new Error(`invalid docId: "${docId}" (expected "Collection/slug")`);
  }
  return {
    collection: docId.slice(0, idx),
    slug: docId.slice(idx + 1).replace(/\//g, '--'),
  };
}

function draftDocRef(docId: string) {
  const {collection, slug} = parseDocId(docId);
  const {firebase, rootConfig} = getCtx();
  return doc(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    collection,
    'Drafts',
    slug
  );
}

// `publishedDocRef`, `versionDocRef`, and `scheduledDocRef` were removed
// alongside the publish/delete handlers. The remaining write handlers only
// touch the draft path — see `draftDocRef` above and the safety policy in
// `core/ai-tools.ts`.

/** Unmarshal with Firestore Timestamp support. */
function unmarshalData(data: any): any {
  return unmarshalDataBase(data, {
    isTimestamp: (v) => v instanceof Timestamp,
    timestampToValue: (v) => v.toMillis(),
  });
}

// marshalData is imported from shared/marshal.js above.

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeToolValue(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

/** Normalizes raw `doc_edit` operations, parsing stringified JSON values. */
function normalizeOperations(operations: any): DocEditOperation[] {
  if (!Array.isArray(operations)) {
    return [];
  }
  return operations.map((op) => {
    const out: DocEditOperation = {op: op?.op, path: op?.path};
    if (op && 'value' in op) {
      out.value = normalizeToolValue(op.value);
    }
    if (op && op.index !== undefined && op.index !== null) {
      out.index = op.index;
    }
    return out;
  });
}

/** Short human-readable label for a single `doc_edit` operation. */
function describeOperation(op: DocEditOperation): string {
  switch (op.op) {
    case 'set':
      return `Set ${op.path}`;
    case 'insert_item':
      return op.index === undefined
        ? `Insert into ${op.path} (append)`
        : `Insert into ${op.path} at ${op.index}`;
    case 'remove_item':
      return `Remove ${op.path}[${op.index}]`;
    default:
      return `${op.op} ${op.path}`;
  }
}

function setValueAtPath(target: any, path: string, value: any) {
  const segments = path.split('.');
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const key = Array.isArray(cursor) ? Number(segment) : segment;
    const nextSegment = segments[i + 1];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = /^\d+$/.test(nextSegment) ? [] : {};
    }
    cursor = cursor[key];
  }
  const last = segments[segments.length - 1];
  const key = Array.isArray(cursor) ? Number(last) : last;
  cursor[key] = value;
}

async function readDraftFields(
  docId: string
): Promise<{found: boolean; fields: Record<string, any>; raw?: any}> {
  const snap = await fbGetDoc(draftDocRef(docId));
  if (!snap.exists()) {
    return {found: false, fields: {}};
  }
  const raw = snap.data() as any;
  return {
    found: true,
    fields: unmarshalData(raw.fields || {}),
    raw,
  };
}

function createReceipt(options: {
  title: string;
  summary: string;
  docId?: string;
  details?: CmsToolDetail[];
}): CmsToolReceipt {
  return {
    type: 'cms-write-receipt',
    title: options.title,
    summary: options.summary,
    docId: options.docId,
    adminUrl: options.docId ? getDocAdminUrl(options.docId) : undefined,
    details: [
      ...(options.details || []),
      {label: 'Status', value: 'Saved to draft'},
      {label: 'Publishing', value: 'Manual publish still required'},
    ],
  };
}

function createPreviewError(options: {
  toolName: CmsWriteToolName;
  title: string;
  summary: string;
  docId?: string;
  path?: string;
  error: string;
  errors?: unknown[];
  hint?: string;
  details?: CmsToolDetail[];
}): CmsToolPreview {
  return {
    toolName: options.toolName,
    title: options.title,
    summary: options.summary,
    docId: options.docId,
    path: options.path,
    details: options.details || [],
    error: options.error,
    errors: options.errors,
    hint: options.hint,
  };
}

export async function previewCmsWriteTool(
  toolName: string,
  input: any
): Promise<CmsToolPreview> {
  if (!isCmsWriteTool(toolName)) {
    throw new Error(`not a write tool: ${toolName}`);
  }
  switch (toolName) {
    case 'doc_set':
      return previewDocSet(input);
    case 'doc_create':
      return previewDocCreate(input);
    case 'doc_updateField':
      return previewDocUpdateField(input);
    case 'doc_edit':
      return previewDocEdit(input);
    case 'doc_duplicate':
      return previewDocDuplicate(input);
    case 'release_create':
      return previewReleaseCreate(input);
    case 'release_update':
      return previewReleaseUpdate(input);
  }
}

async function previewDocSet(input: {
  docId: string;
  fields: Record<string, any>;
}): Promise<CmsToolPreview> {
  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);
  const {validateFields} = await loadValidators();
  const errors = validateFields(input.fields, schema);
  if (errors.length > 0) {
    return createPreviewError({
      toolName: 'doc_set',
      title: 'Replace draft fields',
      summary: `Could not validate the replacement fields for ${input.docId}.`,
      docId: input.docId,
      error: 'VALIDATION_FAILED',
      errors,
      hint: 'The fields payload does not match the collection schema. Read the doc and schema, then retry with a valid payload.',
    });
  }

  const before = await readDraftFields(input.docId);
  return {
    toolName: 'doc_set',
    title: 'Replace draft fields',
    summary: `Replace all draft fields for ${input.docId}.`,
    docId: input.docId,
    before: before.found ? before.fields : {},
    after: input.fields || {},
    details: [
      {label: 'Document', value: input.docId},
      {
        label: 'Operation',
        value: before.found ? 'Replace draft' : 'Create draft',
      },
    ],
  };
}

async function previewDocCreate(input: {
  docId: string;
  fields?: Record<string, any>;
}): Promise<CmsToolPreview> {
  const {collection: collectionId} = parseDocId(input.docId);
  const existing = await fbGetDoc(draftDocRef(input.docId));
  if (existing.exists()) {
    return createPreviewError({
      toolName: 'doc_create',
      title: 'Create draft document',
      summary: `${input.docId} already exists.`,
      docId: input.docId,
      error: 'ALREADY_EXISTS',
      hint: 'Use an unused slug, or use an update tool for the existing draft.',
    });
  }

  if (input.fields) {
    const schema = await getCachedSchema(collectionId);
    const {validateFields} = await loadValidators();
    const errors = validateFields(input.fields, schema);
    if (errors.length > 0) {
      return createPreviewError({
        toolName: 'doc_create',
        title: 'Create draft document',
        summary: `Could not validate the initial fields for ${input.docId}.`,
        docId: input.docId,
        error: 'VALIDATION_FAILED',
        errors,
        hint: 'The fields payload does not match the collection schema.',
      });
    }
  }

  return {
    toolName: 'doc_create',
    title: 'Create draft document',
    summary: `Create ${input.docId} as a new draft document.`,
    docId: input.docId,
    before: {},
    after: input.fields || {},
    details: [
      {label: 'Document', value: input.docId},
      {label: 'Operation', value: 'Create draft'},
    ],
  };
}

async function previewDocUpdateField(input: {
  docId: string;
  path: string;
  value: any;
}): Promise<CmsToolPreview> {
  const value = normalizeToolValue(input.value);
  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);
  const {validateValueAtPath} = await loadValidators();
  const errors = validateValueAtPath(schema, input.path, value);
  if (errors.length > 0) {
    return createPreviewError({
      toolName: 'doc_updateField',
      title: 'Update draft field',
      summary: `Could not validate ${input.path} for ${input.docId}.`,
      docId: input.docId,
      path: input.path,
      error: 'VALIDATION_FAILED',
      errors,
      hint: 'The value does not match the field schema. Inspect the doc and schema, then retry with a valid value.',
    });
  }

  const ref = draftDocRef(input.docId);
  const snap = await fbGetDoc(ref);
  if (!snap.exists()) {
    return createPreviewError({
      toolName: 'doc_updateField',
      title: 'Update draft field',
      summary: `${input.docId} does not exist.`,
      docId: input.docId,
      path: input.path,
      error: 'NOT_FOUND',
      hint: `Doc "${input.docId}" does not exist.`,
    });
  }

  const raw = snap.data() as any;
  const storagePath = resolveArrayObjectPath(raw.fields || {}, input.path);
  if (!storagePath.ok) {
    return createPreviewError({
      toolName: 'doc_updateField',
      title: 'Update draft field',
      summary: `Could not resolve ${input.path} in ${input.docId}.`,
      docId: input.docId,
      path: input.path,
      error: 'VALIDATION_FAILED',
      errors: [storagePath.error],
      hint: 'Use zero-based array indices for existing array items, or set the whole array field when appending or removing items.',
    });
  }

  const before = unmarshalData(raw.fields || {});
  const after = cloneJson(before);
  setValueAtPath(after, input.path, value);
  return {
    toolName: 'doc_updateField',
    title: 'Update draft field',
    summary: `Update ${input.path} in ${input.docId}.`,
    docId: input.docId,
    path: input.path,
    before,
    after,
    details: [
      {label: 'Document', value: input.docId},
      {label: 'Field path', value: input.path},
      {label: 'Operation', value: 'Update draft field'},
    ],
  };
}

async function previewDocEdit(input: {
  docId: string;
  operations: any[];
}): Promise<CmsToolPreview> {
  const operations = normalizeOperations(input.operations);
  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);

  const before = await readDraftFields(input.docId);
  if (!before.found) {
    return createPreviewError({
      toolName: 'doc_edit',
      title: 'Edit draft document',
      summary: `${input.docId} does not exist.`,
      docId: input.docId,
      error: 'NOT_FOUND',
      hint: `Doc "${input.docId}" does not exist. Create it with \`doc_create\` first.`,
    });
  }

  const {applyDocEdits, validateFields} = await loadValidators();
  const applied = applyDocEdits(before.fields, operations);
  if (!applied.ok) {
    return createPreviewError({
      toolName: 'doc_edit',
      title: 'Edit draft document',
      summary: `Operation ${applied.error.opIndex + 1} (${
        applied.error.op
      }) could not be applied to ${input.docId}.`,
      docId: input.docId,
      error: 'INVALID_OPERATION',
      errors: [applied.error],
      hint:
        'Fix the failing operation. Use zero-based array indices, target ' +
        'arrays for insert_item/remove_item, and read the doc with ' +
        '`doc_get` to ' +
        'confirm the current shape.',
    });
  }

  const errors = validateFields(applied.fields, schema);
  if (errors.length > 0) {
    return createPreviewError({
      toolName: 'doc_edit',
      title: 'Edit draft document',
      summary: `The edits to ${input.docId} did not match the collection schema.`,
      docId: input.docId,
      error: 'VALIDATION_FAILED',
      errors,
      hint:
        'The resulting fields do not match the collection schema. Inspect ' +
        'the doc and schema, then retry with valid values.',
    });
  }

  return {
    toolName: 'doc_edit',
    title: 'Edit draft document',
    summary: `Apply ${operations.length} edit${
      operations.length === 1 ? '' : 's'
    } to ${input.docId}.`,
    docId: input.docId,
    before: before.fields,
    after: applied.fields,
    details: [
      {label: 'Document', value: input.docId},
      ...operations.map((op, i) => ({
        label: `Operation ${i + 1}`,
        value: describeOperation(op),
      })),
    ],
  };
}

async function previewDocDuplicate(input: {
  fromDocId: string;
  toDocId: string;
}): Promise<CmsToolPreview> {
  const fromRef = draftDocRef(input.fromDocId);
  const fromSnap = await fbGetDoc(fromRef);
  if (!fromSnap.exists()) {
    return createPreviewError({
      toolName: 'doc_duplicate',
      title: 'Duplicate draft document',
      summary: `${input.fromDocId} does not exist.`,
      docId: input.toDocId,
      error: 'NOT_FOUND',
      hint: `Source doc "${input.fromDocId}" does not exist.`,
      details: [{label: 'Source', value: input.fromDocId}],
    });
  }

  const toRef = draftDocRef(input.toDocId);
  const toSnap = await fbGetDoc(toRef);
  if (toSnap.exists()) {
    return createPreviewError({
      toolName: 'doc_duplicate',
      title: 'Duplicate draft document',
      summary: `${input.toDocId} already exists.`,
      docId: input.toDocId,
      error: 'ALREADY_EXISTS',
      hint: `Target doc "${input.toDocId}" already exists.`,
      details: [
        {label: 'Source', value: input.fromDocId},
        {label: 'Target', value: input.toDocId},
      ],
    });
  }

  const fromData = fromSnap.data() as any;
  const fields = unmarshalData(fromData.fields || {});
  return {
    toolName: 'doc_duplicate',
    title: 'Duplicate draft document',
    summary: `Duplicate ${input.fromDocId} to ${input.toDocId}.`,
    docId: input.toDocId,
    before: {},
    after: fields,
    details: [
      {label: 'Source', value: input.fromDocId},
      {label: 'Target', value: input.toDocId},
      {label: 'Operation', value: 'Create draft copy'},
    ],
  };
}

// ---------------------------------------------------------------------------
// Release tools
// ---------------------------------------------------------------------------
//
// `release_create` and `release_update` group docs for the user to publish
// later — they never publish anything themselves. Updates are limited to
// UNPUBLISHED releases: editing the doc list of a scheduled release would
// change what auto-publishes at the scheduled time. Publishing, scheduling,
// archiving and deleting releases remain user-only actions in the CMS UI
// (see the safety policy in `core/ai-tools.ts`).

interface ReleaseCreateInput {
  releaseId: string;
  description?: string;
  docIds?: string[];
}

interface ReleaseUpdateInput {
  releaseId: string;
  description?: string;
  addDocIds?: string[];
  removeDocIds?: string[];
}

function getReleaseAdminUrl(releaseId: string): string {
  return `/cms/releases/${encodeURIComponent(releaseId)}`;
}

function createReleaseReceipt(options: {
  title: string;
  summary: string;
  releaseId: string;
  details?: CmsToolDetail[];
}): CmsToolReceipt {
  return {
    type: 'cms-write-receipt',
    title: options.title,
    summary: options.summary,
    adminUrl: getReleaseAdminUrl(options.releaseId),
    linkLabel: 'Open release',
    details: [
      ...(options.details || []),
      {label: 'Status', value: 'Release saved'},
      {
        label: 'Publishing',
        value: 'Publish or schedule manually from the CMS UI',
      },
    ],
  };
}

/**
 * Returns an error message if the signed-in user lacks permission to create
 * or edit releases (publish permissions, i.e. ADMIN or EDITOR). Fails open
 * when the roles lookup itself errors — Firestore security rules are the
 * authoritative gate; this pre-check just produces friendlier errors.
 */
async function getReleasePermissionError(): Promise<string | null> {
  let roles: Awaited<ReturnType<typeof fetchProjectRoles>>;
  try {
    roles = await fetchProjectRoles();
  } catch (err) {
    console.error('failed to load project roles:', err);
    return null;
  }
  const email = getCtx().firebase.user?.email || '';
  if (!testCanPublish(roles, email)) {
    return (
      `The signed-in user (${email || 'unknown'}) does not have permission ` +
      'to create or edit releases. Releases require the ADMIN or EDITOR role.'
    );
  }
  return null;
}

/**
 * Normalizes a doc-id list input, parsing stringified JSON, trimming and
 * deduping entries. Returns `null` when the value is not a list of
 * non-empty strings (so callers can reject malformed input instead of
 * silently dropping it).
 */
function normalizeDocIdList(value: any): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  const parsed = normalizeToolValue(value);
  if (!Array.isArray(parsed)) {
    return null;
  }
  const ids = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== 'string' || !item.trim()) {
      return null;
    }
    ids.add(item.trim());
  }
  return Array.from(ids);
}

interface ReleaseDocIdError {
  docId: string;
  message: string;
}

/**
 * Canonicalizes doc ids for release membership (normalizing nested slugs
 * like "Pages/foo/bar" to "Pages/foo--bar", matching how the CMS stores doc
 * ids) and verifies each doc exists as a draft. Returns the sorted canonical
 * ids plus any per-doc errors.
 */
async function resolveReleaseDocIds(
  rawDocIds: string[]
): Promise<{docIds: string[]; errors: ReleaseDocIdError[]}> {
  const canonical = new Set<string>();
  const errors: ReleaseDocIdError[] = [];
  await Promise.all(
    rawDocIds.map(async (rawDocId) => {
      let docId: string;
      try {
        const {collection, slug} = parseDocId(rawDocId);
        docId = `${collection}/${slug}`;
      } catch {
        errors.push({
          docId: rawDocId,
          message: 'Doc id must use the form "Collection/slug".',
        });
        return;
      }
      const snap = await fbGetDoc(draftDocRef(docId));
      if (!snap.exists()) {
        errors.push({
          docId: rawDocId,
          message: 'Doc does not exist as a draft.',
        });
        return;
      }
      canonical.add(docId);
    })
  );
  errors.sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
  return {docIds: Array.from(canonical).sort(), errors};
}

/**
 * Expands remove ids to also match their canonical "Collection/slug" form so
 * "Pages/foo/bar" removes a stored "Pages/foo--bar" entry. Invalid ids are
 * kept verbatim (they can still match a legacy entry). Removed docs are NOT
 * required to exist, so stale references to deleted docs can be cleaned up.
 */
function expandRemoveDocIds(removeDocIds: string[]): string[] {
  const out = new Set<string>();
  for (const removeDocId of removeDocIds) {
    out.add(removeDocId);
    try {
      const {collection, slug} = parseDocId(removeDocId);
      out.add(`${collection}/${slug}`);
    } catch {
      // Keep the raw id only.
    }
  }
  return Array.from(out);
}

interface ReleasePlanError {
  ok: false;
  error: string;
  summary: string;
  errors?: unknown[];
  hint?: string;
}

interface ReleaseCreatePlanOk {
  ok: true;
  releaseId: string;
  description?: string;
  docIds: string[];
}

/**
 * Validates a `release_create` call and computes the release payload.
 * Shared by the approval preview and the execute handler so both apply the
 * same checks.
 */
async function planReleaseCreate(
  input: ReleaseCreateInput
): Promise<ReleaseCreatePlanOk | ReleasePlanError> {
  const releaseId =
    typeof input?.releaseId === 'string' ? input.releaseId.trim() : '';
  if (!releaseId || !isSlugValid(releaseId)) {
    return {
      ok: false,
      error: 'INVALID_RELEASE_ID',
      summary: `"${releaseId}" is not a valid release id.`,
      hint:
        'Release ids use lowercase letters, numbers, underscores and ' +
        'dashes, e.g. "spring-launch".',
    };
  }
  const permissionError = await getReleasePermissionError();
  if (permissionError) {
    return {
      ok: false,
      error: 'PERMISSION_DENIED',
      summary: permissionError,
      hint: 'Ask a project ADMIN or EDITOR to make release changes.',
    };
  }
  const rawDocIds = normalizeDocIdList(input.docIds);
  if (!rawDocIds) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      summary: '`docIds` must be an array of non-empty doc id strings.',
      hint: 'Pass doc ids like ["Pages/home", "BlogPosts/launch"].',
    };
  }
  const existing = await cmsGetRelease(releaseId);
  if (existing) {
    return {
      ok: false,
      error: 'ALREADY_EXISTS',
      summary: `Release "${releaseId}" already exists.`,
      hint:
        'Choose an unused release id, or use `release_update` to modify ' +
        'the existing release.',
    };
  }
  const resolved = await resolveReleaseDocIds(rawDocIds);
  if (resolved.errors.length > 0) {
    return {
      ok: false,
      error: 'INVALID_DOC_IDS',
      summary: 'Some docs could not be added to the release.',
      errors: resolved.errors,
      hint:
        'Docs must exist before adding them to a release. Use `docs_list` ' +
        'to find valid doc ids.',
    };
  }
  const description =
    typeof input.description === 'string'
      ? input.description.trim() || undefined
      : undefined;
  return {ok: true, releaseId, description, docIds: resolved.docIds};
}

interface ReleaseUpdatePlanOk {
  ok: true;
  releaseId: string;
  before: {id: string; description?: string; docIds: string[]};
  after: {id: string; description?: string; docIds: string[]};
  addedDocIds: string[];
  removedDocIds: string[];
  descriptionChanged: boolean;
}

/**
 * Validates a `release_update` call against the current release state and
 * computes the resulting doc list/description. Shared by the approval
 * preview and the execute handler so both apply the same checks.
 */
async function planReleaseUpdate(
  input: ReleaseUpdateInput
): Promise<ReleaseUpdatePlanOk | ReleasePlanError> {
  const releaseId =
    typeof input?.releaseId === 'string' ? input.releaseId.trim() : '';
  if (!releaseId) {
    return {
      ok: false,
      error: 'INVALID_RELEASE_ID',
      summary: 'Missing `releaseId`.',
      hint: 'Use `releases_list` to find valid release ids.',
    };
  }
  const permissionError = await getReleasePermissionError();
  if (permissionError) {
    return {
      ok: false,
      error: 'PERMISSION_DENIED',
      summary: permissionError,
      hint: 'Ask a project ADMIN or EDITOR to make release changes.',
    };
  }
  const addRaw = normalizeDocIdList(input.addDocIds);
  const removeRaw = normalizeDocIdList(input.removeDocIds);
  if (!addRaw || !removeRaw) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      summary:
        '`addDocIds` and `removeDocIds` must be arrays of non-empty doc ' +
        'id strings.',
      hint: 'Pass doc ids like ["Pages/home"].',
    };
  }
  const description =
    typeof input.description === 'string' ? input.description : undefined;
  if (
    addRaw.length === 0 &&
    removeRaw.length === 0 &&
    description === undefined
  ) {
    return {
      ok: false,
      error: 'NO_CHANGES',
      summary: 'No changes were requested.',
      hint: 'Pass `description`, `addDocIds` and/or `removeDocIds`.',
    };
  }
  const release = await cmsGetRelease(releaseId);
  if (!release) {
    return {
      ok: false,
      error: 'NOT_FOUND',
      summary: `Release "${releaseId}" does not exist.`,
      hint:
        'Use `releases_list` to find valid release ids, or create one ' +
        'with `release_create`.',
    };
  }
  const {computeReleaseDocIds, getReleaseStatus} = await loadValidators();
  const status = getReleaseStatus(release);
  if (status !== 'unpublished') {
    const hints: Record<string, string> = {
      scheduled:
        'The release is scheduled for publishing. The user must ' +
        'unschedule it from the CMS UI before it can be edited.',
      published:
        'The release has already been published. Create a new release ' +
        'for further changes.',
      archived:
        'The release is archived. The user must unarchive it from the ' +
        'CMS UI before it can be edited.',
    };
    return {
      ok: false,
      error: 'RELEASE_NOT_EDITABLE',
      summary: `Release "${releaseId}" is ${status} and cannot be edited.`,
      hint: hints[status],
    };
  }
  const resolvedAdds = await resolveReleaseDocIds(addRaw);
  if (resolvedAdds.errors.length > 0) {
    return {
      ok: false,
      error: 'INVALID_DOC_IDS',
      summary: 'Some docs could not be added to the release.',
      errors: resolvedAdds.errors,
      hint:
        'Docs must exist before adding them to a release. Use `docs_list` ' +
        'to find valid doc ids.',
    };
  }
  const existingDocIds = Array.from(new Set(release.docIds || [])).sort();
  const newDocIds = computeReleaseDocIds(
    existingDocIds,
    resolvedAdds.docIds,
    expandRemoveDocIds(removeRaw)
  );
  const oldDescription = release.description || undefined;
  const newDescription =
    description !== undefined
      ? description.trim() || undefined
      : oldDescription;
  const docsChanged =
    JSON.stringify(existingDocIds) !== JSON.stringify(newDocIds);
  const descriptionChanged = newDescription !== oldDescription;
  if (!docsChanged && !descriptionChanged) {
    return {
      ok: false,
      error: 'NO_CHANGES',
      summary: `The requested update would not change release "${releaseId}".`,
      hint:
        'Check the current release contents with `release_get`, then ' +
        'retry with docs that are not already in the requested state.',
    };
  }
  return {
    ok: true,
    releaseId,
    before: {
      id: releaseId,
      description: oldDescription,
      docIds: existingDocIds,
    },
    after: {id: releaseId, description: newDescription, docIds: newDocIds},
    addedDocIds: newDocIds.filter((id) => !existingDocIds.includes(id)),
    removedDocIds: existingDocIds.filter((id) => !newDocIds.includes(id)),
    descriptionChanged,
  };
}

/** Short human-readable summary of a planned `release_update`. */
function describeReleaseUpdate(plan: ReleaseUpdatePlanOk): string {
  const parts: string[] = [];
  if (plan.addedDocIds.length > 0) {
    const n = plan.addedDocIds.length;
    parts.push(`add ${n} doc${n === 1 ? '' : 's'}`);
  }
  if (plan.removedDocIds.length > 0) {
    const n = plan.removedDocIds.length;
    parts.push(`remove ${n} doc${n === 1 ? '' : 's'}`);
  }
  if (plan.descriptionChanged) {
    parts.push('update the description');
  }
  return `Update release ${plan.releaseId}: ${parts.join(', ')}.`;
}

async function previewReleaseCreate(
  input: ReleaseCreateInput
): Promise<CmsToolPreview> {
  const plan = await planReleaseCreate(input);
  if (!plan.ok) {
    return createPreviewError({
      toolName: 'release_create',
      title: 'Create release',
      summary: plan.summary,
      error: plan.error,
      errors: plan.errors,
      hint: plan.hint,
    });
  }
  const after: Record<string, unknown> = {id: plan.releaseId};
  if (plan.description) {
    after.description = plan.description;
  }
  after.docIds = plan.docIds;
  return {
    toolName: 'release_create',
    title: 'Create release',
    summary: `Create release ${plan.releaseId} with ${plan.docIds.length} doc${
      plan.docIds.length === 1 ? '' : 's'
    }.`,
    before: {},
    after,
    details: [
      {label: 'Release', value: plan.releaseId},
      {label: 'Docs', value: String(plan.docIds.length)},
      {label: 'Operation', value: 'Create release'},
    ],
    approveLabel: 'Approve release change',
  };
}

async function previewReleaseUpdate(
  input: ReleaseUpdateInput
): Promise<CmsToolPreview> {
  const plan = await planReleaseUpdate(input);
  if (!plan.ok) {
    return createPreviewError({
      toolName: 'release_update',
      title: 'Update release',
      summary: plan.summary,
      error: plan.error,
      errors: plan.errors,
      hint: plan.hint,
    });
  }
  const details: CmsToolDetail[] = [{label: 'Release', value: plan.releaseId}];
  if (plan.addedDocIds.length > 0) {
    details.push({label: 'Add docs', value: plan.addedDocIds.join(', ')});
  }
  if (plan.removedDocIds.length > 0) {
    details.push({label: 'Remove docs', value: plan.removedDocIds.join(', ')});
  }
  if (plan.descriptionChanged) {
    details.push({
      label: 'Description',
      value: plan.after.description || '(cleared)',
    });
  }
  return {
    toolName: 'release_update',
    title: 'Update release',
    summary: describeReleaseUpdate(plan),
    before: plan.before,
    after: plan.after,
    details,
    approveLabel: 'Approve release change',
  };
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------
//
// Only write tools live here. Read tools (`doc_get`, `docs_list`,
// `docs_search`, `doc_getVersion`, `doc_listVersions`, `schema_get`,
// `collections_list`, `releases_list`, `release_get`) execute via the
// `execute` blocks in `core/ai-tools.ts`.

async function getCachedSchema(collectionId: string): Promise<Collection> {
  return await fetchCollectionSchema(collectionId);
}

async function docSet(input: {docId: string; fields: Record<string, any>}) {
  const {collection: collectionId, slug} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);
  const {validateFields} = await loadValidators();
  const errors = validateFields(input.fields, schema);
  if (errors.length > 0) {
    return {
      success: false,
      docId: input.docId,
      error: 'VALIDATION_FAILED',
      errors,
      hint:
        'The fields payload did not match the collection schema. Read the ' +
        'doc with `doc_get` for an example of the expected shape, then retry ' +
        'with a valid payload.',
    };
  }

  const {firebase} = getCtx();
  const ref = draftDocRef(input.docId);
  const existing = await fbGetDoc(ref);
  const existingData = existing.exists() ? (existing.data() as any) : {};
  const existingSys = existingData.sys || {};
  const userEmail = firebase.user?.email || 'root-cms-ai';
  const data = {
    id: input.docId,
    collection: collectionId,
    slug,
    sys: {
      ...existingSys,
      createdAt: existingSys.createdAt ?? serverTimestamp(),
      createdBy: existingSys.createdBy ?? userEmail,
      modifiedAt: serverTimestamp(),
      modifiedBy: userEmail,
      locales: existingSys.locales ?? ['en'],
    },
    fields: marshalData(input.fields),
  };
  await setDoc(ref, data);
  return {
    success: true,
    docId: input.docId,
    receipt: createReceipt({
      title: 'Updated draft document',
      summary: `Replaced all draft fields for ${input.docId}.`,
      docId: input.docId,
      details: [
        {label: 'Document', value: input.docId},
        {label: 'Operation', value: 'Replace draft fields'},
      ],
    }),
  };
}

async function docCreate(input: {docId: string; fields?: Record<string, any>}) {
  const {collection: collectionId, slug} = parseDocId(input.docId);
  const ref = draftDocRef(input.docId);
  const existing = await fbGetDoc(ref);
  if (existing.exists()) {
    return {
      success: false,
      docId: input.docId,
      error: 'ALREADY_EXISTS',
      hint: 'A doc with this id already exists. Use `doc_set` to overwrite.',
    };
  }

  if (input.fields) {
    const schema = await getCachedSchema(collectionId);
    const {validateFields} = await loadValidators();
    const errors = validateFields(input.fields, schema);
    if (errors.length > 0) {
      return {
        success: false,
        docId: input.docId,
        error: 'VALIDATION_FAILED',
        errors,
        hint: 'The fields payload did not match the collection schema.',
      };
    }
  }

  const {firebase} = getCtx();
  const userEmail = firebase.user?.email || 'root-cms-ai';
  const data = {
    id: input.docId,
    collection: collectionId,
    slug,
    sys: {
      createdAt: serverTimestamp(),
      createdBy: userEmail,
      modifiedAt: serverTimestamp(),
      modifiedBy: userEmail,
      locales: ['en'],
    },
    fields: input.fields ? marshalData(input.fields) : {},
  };
  await setDoc(ref, data);
  return {
    success: true,
    docId: input.docId,
    receipt: createReceipt({
      title: 'Created draft document',
      summary: `Created ${input.docId} as a new draft document.`,
      docId: input.docId,
      details: [
        {label: 'Document', value: input.docId},
        {label: 'Operation', value: 'Create draft'},
      ],
    }),
  };
}

async function docUpdateField(input: {
  docId: string;
  path: string;
  value: any;
}) {
  const value = normalizeToolValue(input.value);

  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);
  const {validateValueAtPath} = await loadValidators();
  const errors = validateValueAtPath(schema, input.path, value);
  if (errors.length > 0) {
    return {
      success: false,
      docId: input.docId,
      path: input.path,
      error: 'VALIDATION_FAILED',
      errors,
      hint:
        'The value did not match the field schema. Inspect the doc with ' +
        '`doc_get` to see the expected shape, then retry with a valid value.',
    };
  }

  const ref = draftDocRef(input.docId);
  const snap = await fbGetDoc(ref);
  if (!snap.exists()) {
    return {
      success: false,
      docId: input.docId,
      path: input.path,
      error: 'NOT_FOUND',
      hint: `Doc "${input.docId}" does not exist.`,
    };
  }

  const raw = snap.data() as any;
  const storagePath = resolveArrayObjectPath(raw.fields || {}, input.path);
  if (!storagePath.ok) {
    return {
      success: false,
      docId: input.docId,
      path: input.path,
      error: 'VALIDATION_FAILED',
      errors: [storagePath.error],
      hint:
        'The path could not be resolved against the current draft. Use ' +
        'zero-based array indices for existing array items, or set the ' +
        'whole array field when appending or removing items.',
    };
  }

  const {firebase} = getCtx();
  const fieldKey = `fields.${storagePath.path}`;
  const marshalled = marshalData(value);
  await updateDoc(ref, {
    [fieldKey]: marshalled,
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': firebase.user?.email || 'root-cms-ai',
  });
  return {
    success: true,
    docId: input.docId,
    path: input.path,
    receipt: createReceipt({
      title: 'Updated draft field',
      summary: `Updated ${input.path} in ${input.docId}.`,
      docId: input.docId,
      details: [
        {label: 'Document', value: input.docId},
        {label: 'Field path', value: input.path},
        {label: 'Operation', value: 'Update draft field'},
      ],
    }),
  };
}

async function docEdit(input: {docId: string; operations: any[]}) {
  const operations = normalizeOperations(input.operations);
  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);

  const ref = draftDocRef(input.docId);
  const snap = await fbGetDoc(ref);
  if (!snap.exists()) {
    return {
      success: false,
      docId: input.docId,
      error: 'NOT_FOUND',
      hint: `Doc "${input.docId}" does not exist.`,
    };
  }
  const raw = snap.data() as any;
  const currentFields = unmarshalData(raw.fields || {});

  const {applyDocEdits, validateFields} = await loadValidators();
  const applied = applyDocEdits(currentFields, operations);
  if (!applied.ok) {
    return {
      success: false,
      docId: input.docId,
      error: 'INVALID_OPERATION',
      errors: [applied.error],
      hint:
        'Fix the failing operation. Use zero-based array indices, target ' +
        'arrays for insert_item/remove_item, and read the doc with ' +
        '`doc_get` to ' +
        'confirm the current shape.',
    };
  }

  const errors = validateFields(applied.fields, schema);
  if (errors.length > 0) {
    return {
      success: false,
      docId: input.docId,
      error: 'VALIDATION_FAILED',
      errors,
      hint:
        'The resulting fields did not match the collection schema. Inspect ' +
        'the doc with `doc_get`, then retry with valid values.',
    };
  }

  const {firebase} = getCtx();
  await updateDoc(ref, {
    fields: marshalData(applied.fields),
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': firebase.user?.email || 'root-cms-ai',
  });
  return {
    success: true,
    docId: input.docId,
    receipt: createReceipt({
      title: 'Edited draft document',
      summary: `Applied ${operations.length} edit${
        operations.length === 1 ? '' : 's'
      } to ${input.docId}.`,
      docId: input.docId,
      details: [
        {label: 'Document', value: input.docId},
        {label: 'Operations', value: String(operations.length)},
        ...operations.map((op, i) => ({
          label: `Operation ${i + 1}`,
          value: describeOperation(op),
        })),
      ],
    }),
  };
}

// docPublish, docDelete, and docRevertDraft are intentionally NOT
// implemented here — see the safety policy comment in `core/ai-tools.ts`
// (`createCmsTools`). Publishing, permanent deletes, and discarding
// in-progress drafts must be initiated by the user through the CMS UI,
// not by the chat model.

async function docDuplicate(input: {fromDocId: string; toDocId: string}) {
  const fromRef = draftDocRef(input.fromDocId);
  const fromSnap = await fbGetDoc(fromRef);
  if (!fromSnap.exists()) {
    return {
      success: false,
      error: 'NOT_FOUND',
      hint: `Source doc "${input.fromDocId}" does not exist.`,
    };
  }

  const toRef = draftDocRef(input.toDocId);
  const toSnap = await fbGetDoc(toRef);
  if (toSnap.exists()) {
    return {
      success: false,
      error: 'ALREADY_EXISTS',
      hint: `Target doc "${input.toDocId}" already exists.`,
    };
  }

  const {collection: collectionId, slug} = parseDocId(input.toDocId);
  const {firebase} = getCtx();
  const userEmail = firebase.user?.email || 'root-cms-ai';
  const fromData = fromSnap.data() as any;
  const data = {
    id: input.toDocId,
    collection: collectionId,
    slug,
    sys: {
      createdAt: serverTimestamp(),
      createdBy: userEmail,
      modifiedAt: serverTimestamp(),
      modifiedBy: userEmail,
      locales: fromData.sys?.locales ?? ['en'],
    },
    fields: fromData.fields || {},
  };
  await setDoc(toRef, data);
  return {
    success: true,
    fromDocId: input.fromDocId,
    toDocId: input.toDocId,
    receipt: createReceipt({
      title: 'Duplicated draft document',
      summary: `Duplicated ${input.fromDocId} to ${input.toDocId}.`,
      docId: input.toDocId,
      details: [
        {label: 'Source', value: input.fromDocId},
        {label: 'Target', value: input.toDocId},
        {label: 'Operation', value: 'Create draft copy'},
      ],
    }),
  };
}

async function docTranslateField(input: {
  sourceText: string;
  targetLocales: string[];
  description?: string;
}) {
  const res = await fetch('/cms/api/ai.translate', {
    method: 'POST',
    credentials: 'include',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      sourceText: input.sourceText,
      targetLocales: input.targetLocales,
      description: input.description,
    }),
  });
  if (!res.ok) {
    throw new Error(`ai.translate failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'translation failed');
  }
  return {translations: data.translations};
}

async function releaseCreate(input: ReleaseCreateInput) {
  const plan = await planReleaseCreate(input);
  if (!plan.ok) {
    return {
      success: false,
      releaseId: input?.releaseId,
      error: plan.error,
      message: plan.summary,
      errors: plan.errors,
      hint: plan.hint,
    };
  }
  const release: Partial<Release> = {docIds: plan.docIds};
  if (plan.description) {
    release.description = plan.description;
  }
  await addRelease(plan.releaseId, release);
  return {
    success: true,
    releaseId: plan.releaseId,
    docIds: plan.docIds,
    receipt: createReleaseReceipt({
      title: 'Created release',
      summary: `Created release ${plan.releaseId} with ${
        plan.docIds.length
      } doc${plan.docIds.length === 1 ? '' : 's'}.`,
      releaseId: plan.releaseId,
      details: [
        {label: 'Release', value: plan.releaseId},
        {label: 'Docs', value: String(plan.docIds.length)},
        {label: 'Operation', value: 'Create release'},
      ],
    }),
  };
}

async function releaseUpdate(input: ReleaseUpdateInput) {
  const plan = await planReleaseUpdate(input);
  if (!plan.ok) {
    return {
      success: false,
      releaseId: input?.releaseId,
      error: plan.error,
      message: plan.summary,
      errors: plan.errors,
      hint: plan.hint,
    };
  }
  const updates: Record<string, unknown> = {docIds: plan.after.docIds};
  if (plan.descriptionChanged) {
    updates.description =
      plan.after.description !== undefined
        ? plan.after.description
        : deleteField();
  }
  await cmsUpdateRelease(plan.releaseId, updates as Partial<Release>);
  const details: CmsToolDetail[] = [{label: 'Release', value: plan.releaseId}];
  if (plan.addedDocIds.length > 0) {
    details.push({label: 'Added', value: plan.addedDocIds.join(', ')});
  }
  if (plan.removedDocIds.length > 0) {
    details.push({label: 'Removed', value: plan.removedDocIds.join(', ')});
  }
  if (plan.descriptionChanged) {
    details.push({
      label: 'Description',
      value: plan.after.description || '(cleared)',
    });
  }
  return {
    success: true,
    releaseId: plan.releaseId,
    docIds: plan.after.docIds,
    addedDocIds: plan.addedDocIds,
    removedDocIds: plan.removedDocIds,
    receipt: createReleaseReceipt({
      title: 'Updated release',
      summary: describeReleaseUpdate(plan),
      releaseId: plan.releaseId,
      details,
    }),
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (input: any) => Promise<unknown>> = {
  doc_set: docSet,
  doc_create: docCreate,
  doc_updateField: docUpdateField,
  doc_edit: docEdit,
  doc_duplicate: docDuplicate,
  doc_translateField: docTranslateField,
  release_create: releaseCreate,
  release_update: releaseUpdate,
};

/**
 * Dispatches a tool call to the matching handler. Returns the tool output,
 * or an `{error, message}` object the model can surface back to the user.
 */
export async function executeCmsTool(
  toolName: string,
  input: any
): Promise<unknown> {
  const handler = HANDLERS[toolName];
  if (!handler) {
    return {error: 'UNKNOWN_TOOL', toolName};
  }
  try {
    return await handler(input);
  } catch (err: any) {
    console.error(`tool ${toolName} failed:`, err);
    return {
      error: 'TOOL_EXECUTION_FAILED',
      message: err?.message || String(err),
    };
  }
}
