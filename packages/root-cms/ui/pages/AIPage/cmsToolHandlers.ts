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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {Collection} from '../../../core/schema.js';
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

/** Mirrors `unmarshalData` from `core/client.ts` for the read path. */
function unmarshalData(data: any): any {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(unmarshalData);
  }
  if (data instanceof Timestamp) {
    return data.toMillis();
  }
  if (Array.isArray(data._array)) {
    return data._array.map((key: string) => unmarshalData(data[key] ?? {}));
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = unmarshalData(v);
  }
  return out;
}

/** Mirrors `marshalArray` from `core/client.ts` for the write path. */
function marshalData(data: any): any {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    const obj: Record<string, any> = {};
    const keys: string[] = [];
    for (const item of data) {
      const key =
        item && typeof item === 'object' && typeof item._arrayKey === 'string'
          ? item._arrayKey
          : Math.random().toString(36).slice(2, 8);
      keys.push(key);
      const cleaned = {...item};
      delete cleaned._arrayKey;
      obj[key] = marshalData(cleaned);
    }
    obj._array = keys;
    return obj;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = marshalData(v);
  }
  return out;
}

async function listCollections() {
  const {collections} = getCtx();
  return {
    collections: Object.entries(collections).map(([id, meta]) => ({
      id,
      name: meta.name,
      description: meta.description,
    })),
  };
}

async function listDocs(input: {
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

async function getDocImpl(input: {
  docId: string;
  mode?: 'draft' | 'published';
}) {
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

async function getCachedSchema(collectionId: string): Promise<Collection> {
  return await fetchCollectionSchema(collectionId);
}

async function updateDocField(input: {
  docId: string;
  path: string;
  value: any;
}) {
  const {collection: collectionId} = parseDocId(input.docId);
  const schema = await getCachedSchema(collectionId);
  const {validateValueAtPath} = await loadValidators();
  const errors = validateValueAtPath(schema, input.path, input.value);
  if (errors.length > 0) {
    return {
      success: false,
      docId: input.docId,
      path: input.path,
      error: 'VALIDATION_FAILED',
      errors,
      hint:
        'The value did not match the field schema. Inspect the doc with ' +
        '`getDoc` to see the expected shape, then retry with a valid value.',
    };
  }

  const {firebase} = getCtx();
  const ref = draftDocRef(input.docId);
  const fieldKey = `fields.${input.path}`;
  const marshalled = marshalData(input.value);
  await updateDoc(ref, {
    [fieldKey]: marshalled,
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': firebase.user?.email || 'root-cms-ai',
  });
  return {success: true, docId: input.docId, path: input.path};
}

async function setDocImpl(input: {docId: string; fields: Record<string, any>}) {
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
        'doc with `getDoc` for an example of the expected shape, then retry ' +
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

async function searchDocs(input: {query: string; limit?: number}) {
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

const HANDLERS: Record<string, (input: any) => Promise<unknown>> = {
  listCollections,
  listDocs,
  getDoc: getDocImpl,
  updateDocField,
  setDoc: setDocImpl,
  searchDocs,
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
