/**
 * Client-side implementations of the CMS tools declared in
 * `core/ai-tools.ts`. Each handler runs in the browser using the signed-in
 * user's Firebase credentials.
 *
 * Reads/writes go directly through Firestore so other connected CMS clients
 * see updates in real time, and Firestore security rules apply naturally.
 */
import {
  collection as fbCollection,
  doc,
  Firestore,
  getDoc as fbGetDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {Collection} from '../../../core/schema.js';
import {
  marshalData,
  unmarshalData as unmarshalDataBase,
} from '../../../shared/marshal.js';
import {fetchCollectionSchema} from '../../utils/collection.js';

/** Lazily import the validators so we don't double-bundle them. */
type Validators = typeof import('../../../core/ai-tools.js');
let validatorsPromise: Promise<Validators> | null = null;
function loadValidators(): Promise<Validators> {
  if (!validatorsPromise) {
    validatorsPromise = import('../../../core/ai-tools.js');
  }
  return validatorsPromise;
}

interface RootCtxLike {
  rootConfig: {projectId: string};
  collections: Record<
    string,
    {name?: string; description?: string; [key: string]: any}
  >;
  firebase: {db: Firestore; user: {email?: string | null}};
}

function getCtx(): RootCtxLike {
  const w = window as any;
  return {
    rootConfig: w.__ROOT_CTX.rootConfig,
    collections: w.__ROOT_CTX.collections || {},
    firebase: w.firebase,
  };
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

function publishedDocRef(docId: string) {
  const {collection, slug} = parseDocId(docId);
  const {firebase, rootConfig} = getCtx();
  return doc(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    collection,
    'Published',
    slug
  );
}

// `scheduledDocRef` was removed alongside the publish/delete handlers
// (see safety policy in `core/ai-tools.ts`).

function versionDocRef(docId: string, versionId: string) {
  const {collection, slug} = parseDocId(docId);
  const {firebase, rootConfig} = getCtx();
  return doc(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    collection,
    'Drafts',
    slug,
    'Versions',
    versionId
  );
}

/** Unmarshal with Firestore Timestamp support. */
function unmarshalData(data: any): any {
  return unmarshalDataBase(data, {
    isTimestamp: (v) => v instanceof Timestamp,
    timestampToValue: (v) => v.toMillis(),
  });
}

// marshalData is imported from shared/marshal.js above.

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

async function collectionsList() {
  const {collections} = getCtx();
  return {
    collections: Object.entries(collections).map(([id, meta]) => ({
      id,
      name: meta.name,
      description: meta.description,
    })),
  };
}

async function docsList(input: {
  collectionId: string;
  mode?: 'draft' | 'published';
  limit?: number;
}) {
  const {firebase, rootConfig} = getCtx();
  const mode = input.mode ?? 'draft';
  const max = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const colRef = fbCollection(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    input.collectionId,
    mode === 'draft' ? 'Drafts' : 'Published'
  );
  const snap = await getDocs(query(colRef, fbLimit(max)));
  return {
    docs: snap.docs.map((d) => {
      const data = d.data() as any;
      return {id: data.id, slug: data.slug, sys: unmarshalData(data.sys || {})};
    }),
  };
}

async function docsSearch(input: {query: string; limit?: number}) {
  const max = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const res = await fetch('/cms/api/search.query', {
    method: 'POST',
    credentials: 'include',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({q: input.query, limit: max}),
  });
  if (!res.ok) {
    throw new Error(`search.query failed: ${res.status}`);
  }
  const data = await res.json();
  return data;
}

async function docGet(input: {docId: string; mode?: 'draft' | 'published'}) {
  const {firebase, rootConfig} = getCtx();
  const {collection, slug} = parseDocId(input.docId);
  const ref = doc(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    collection,
    input.mode === 'published' ? 'Published' : 'Drafts',
    slug
  );
  const snap = await fbGetDoc(ref);
  if (!snap.exists()) {
    return {found: false};
  }
  const raw = snap.data() as any;
  return {
    found: true,
    doc: {
      id: raw.id,
      collection: raw.collection,
      slug: raw.slug,
      sys: unmarshalData(raw.sys || {}),
      fields: unmarshalData(raw.fields || {}),
    },
  };
}

async function docGetVersion(input: {docId: string; versionId: string}) {
  let ref;
  if (input.versionId === 'draft') {
    ref = draftDocRef(input.docId);
  } else if (input.versionId === 'published') {
    ref = publishedDocRef(input.docId);
  } else {
    ref = versionDocRef(input.docId, input.versionId);
  }
  const snap = await fbGetDoc(ref);
  if (!snap.exists()) {
    return {found: false};
  }
  const raw = snap.data() as any;
  return {
    found: true,
    doc: {
      id: raw.id,
      collection: raw.collection,
      slug: raw.slug,
      sys: unmarshalData(raw.sys || {}),
      fields: unmarshalData(raw.fields || {}),
    },
  };
}

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
  return {success: true, docId: input.docId};
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
  return {success: true, docId: input.docId};
}

async function docUpdateField(input: {
  docId: string;
  path: string;
  value: any;
}) {
  let value = input.value;
  // Auto-parse JSON strings that the AI model forgot to parse.
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        // Not valid JSON; keep the original string value.
      }
    }
  }

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

  const {firebase} = getCtx();
  const ref = draftDocRef(input.docId);
  const fieldKey = `fields.${input.path}`;
  const marshalled = marshalData(value);
  await updateDoc(ref, {
    [fieldKey]: marshalled,
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': firebase.user?.email || 'root-cms-ai',
  });
  return {success: true, docId: input.docId, path: input.path};
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
  return {success: true, fromDocId: input.fromDocId, toDocId: input.toDocId};
}

async function docListVersions(input: {docId: string; limit?: number}) {
  const {firebase, rootConfig} = getCtx();
  const {collection, slug} = parseDocId(input.docId);
  const max = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const versionsCol = fbCollection(
    firebase.db,
    'Projects',
    rootConfig.projectId,
    'Collections',
    collection,
    'Drafts',
    slug,
    'Versions'
  );
  const snap = await getDocs(
    query(versionsCol, orderBy('sys.modifiedAt', 'desc'), fbLimit(max))
  );
  return {
    versions: snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        versionId: d.id,
        sys: unmarshalData(data.sys || {}),
        tags: data.tags || [],
        publishMessage: data.publishMessage,
      };
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

async function schemaGet(input: {collectionId: string}) {
  const schema = await fetchCollectionSchema(input.collectionId);
  // Return a simplified representation for the model.
  return {
    collectionId: input.collectionId,
    fields: simplifyFields(schema.fields || []),
  };
}

/** Simplifies field definitions for the model (omit internal metadata). */
function simplifyFields(fields: any[]): any[] {
  return fields.map((f) => {
    const out: any = {id: f.id, type: f.type};
    if (f.label) out.label = f.label;
    if (f.description) out.description = f.description;
    if (f.required) out.required = true;
    if (f.translate) out.translate = true;
    if (f.options) out.options = f.options;
    if (f.type === 'object' && f.fields) {
      out.fields = simplifyFields(f.fields);
    }
    if (f.type === 'array' && f.of) {
      out.of = simplifyFields([f.of])[0];
    }
    if (f.type === 'oneof' && f.types) {
      out.types = f.types.map((t: any) =>
        typeof t === 'string'
          ? t
          : {id: t.id, fields: simplifyFields(t.fields || [])}
      );
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (input: any) => Promise<unknown>> = {
  collections_list: collectionsList,
  docs_list: docsList,
  docs_search: docsSearch,
  doc_get: docGet,
  doc_getVersion: docGetVersion,
  doc_set: docSet,
  doc_create: docCreate,
  doc_updateField: docUpdateField,
  doc_duplicate: docDuplicate,
  doc_listVersions: docListVersions,
  doc_translateField: docTranslateField,
  schema_get: schemaGet,
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
