/**
 * Built-in CMS tools exposed to the chat model on the `/cms/ai` page.
 *
 * Read tools (`doc_get`, `docs_list`, etc.) execute server-side via the
 * Firebase Admin SDK when a `CmsToolContext` is passed to the factory. This
 * keeps potentially-large doc payloads off the wire: results stay in the
 * model's server-side context instead of round-tripping through the browser
 * on every chat turn.
 *
 * Write tools (`doc_set`, `doc_create`, `doc_updateField`, `doc_duplicate`)
 * stay schema-only here — the browser executes them via `onToolCall` so the
 * user can approve diffs in the UI and so Firestore listeners on other tabs
 * see the change immediately.
 *
 * Validation helpers (`validateFields`, `validateValueAtPath`) live here
 * too so both browser and server can share the same checks.
 *
 * Browser-import safety: this module is dynamically imported by the browser
 * bundle (cmsToolHandlers.ts) to reuse the validators, so it must not pull
 * server-only modules into runtime imports. `RootCMSClient` and `RootConfig`
 * are referenced as types only; the actual instance is passed in at call
 * time via `CmsToolContext`.
 */
import type {RootConfig} from '@blinkk/root';
import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {unmarshalData} from '../shared/marshal.js';
import {normalizeSlug} from '../shared/slug.js';
import type {RootCMSClient} from './client.js';
import {
  ArrayField,
  Collection,
  Field,
  ObjectField,
  OneOfField,
  Schema,
} from './schema.js';
import {validateFields, validateValue} from './validation.js';
import type {ValidationError} from './validation.js';

/** Tool ids handled client-side. Kept in sync with the schemas below. */
export const CMS_TOOL_NAMES = [
  'collections_list',
  'docs_list',
  // TODO: re-enable once search quality improves.
  // 'docs_search',
  'doc_get',
  'doc_getVersion',
  'doc_set',
  'doc_create',
  'doc_updateField',
  'doc_edit',
  'doc_duplicate',
  'doc_listVersions',
  'doc_translateField',
  'schema_get',
] as const;
export type CmsToolName = (typeof CMS_TOOL_NAMES)[number];

/**
 * Subset of CMS tools that perform reads only. Used by flows where the user
 * approves changes via UI (e.g. the array-item "Edit with AI" diff viewer)
 * and the model must not write to Firestore directly.
 */
export const READ_ONLY_CMS_TOOL_NAMES: readonly CmsToolName[] = [
  'collections_list',
  'docs_list',
  // TODO: re-enable once search quality improves.
  // 'docs_search',
  'doc_get',
  'doc_getVersion',
  'doc_listVersions',
  'schema_get',
] as const;

/**
 * Result of a server-side search invocation. Loosely-typed — the result is
 * serialized to JSON and handed to the model, so extra fields are fine.
 * `hits` is an array of objects each carrying at least a `docId`.
 */
export interface CmsSearchResult {
  hits: Array<Record<string, unknown> | {docId: string}>;
}

/**
 * Context passed into the tool factory to enable server-side execution of
 * the read tools. The caller (typically `runChatStream` in `core/ai.ts`)
 * owns the Firebase Admin client and the schema/search lookups.
 */
export interface CmsToolContext {
  cmsClient: RootCMSClient;
  user: string;
  rootConfig: RootConfig;
  loadCollection: (collectionId: string) => Promise<Collection | null>;
  loadAllCollections: () => Promise<Record<string, Collection>>;
  search: (query: string, options: {limit: number}) => Promise<CmsSearchResult>;
}

/**
 * Returns a `ToolSet` filtered to only the read-only CMS tools. Use this in
 * flows where the AI assists with proposing changes that the user reviews
 * and saves manually (so the model can read context but cannot mutate data).
 */
export function createReadOnlyCmsTools(ctx: CmsToolContext): ToolSet {
  const all = createCmsTools(ctx);
  const out: ToolSet = {};
  for (const name of READ_ONLY_CMS_TOOL_NAMES) {
    if (all[name]) {
      out[name] = all[name];
    }
  }
  return out;
}

/**
 * Builds the full tool set advertised to the model.
 *
 * Read tools (`collections_list`, `docs_list`, `docs_search`, `doc_get`,
 * `doc_getVersion`, `doc_listVersions`, `schema_get`) carry a server-side
 * `execute` so the Vercel AI SDK runs them in-process; their results stay
 * in the model's server-side context and never round-trip through the
 * browser. Write tools (`doc_set`, `doc_create`, `doc_updateField`,
 * `doc_duplicate`, `doc_translateField`) remain schema-only — the browser
 * executes them via `onToolCall` so the user can approve diffs before
 * persistence.
 *
 * Safety policy: this tool set is intentionally read + draft-write only.
 * The following operations are deliberately NOT exposed to the model
 * because they are publishing-related, destructive, or otherwise
 * irreversible. Surfacing them would let a single hallucinated tool call
 * affect the live site or wipe authored content. Users must perform these
 * actions themselves through the regular CMS UI:
 *
 *   - `doc_publish` / `doc_unpublish` — promote/demote a draft to/from
 *     production. Always user-initiated.
 *   - `doc_delete` — permanent removal of a doc.
 *   - `doc_revertDraft` — discards in-progress draft edits.
 *   - `doc_schedule` / `doc_unschedule` — affects future production state.
 *   - `doc_lockPublishing` / `doc_unlockPublishing` — affects governance state.
 *   - `doc_restoreVersion` — overwrites the current draft with old data.
 *   - Bulk variants (e.g. `docs_publish`) of any of the above.
 *
 * If you add new write tools here, keep them limited to draft-mode edits
 * the user can easily review before publishing.
 */
export function createCmsTools(ctx: CmsToolContext): ToolSet {
  return {
    collections_list: tool({
      description:
        'List all CMS collections defined in the project. Returns each ' +
        'collection id along with optional name/description metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        const collections = await ctx.loadAllCollections();
        return {
          collections: Object.entries(collections).map(([id, meta]) => ({
            id,
            name: meta.name,
            description: meta.description,
          })),
        };
      },
    }),

    docs_list: tool({
      description:
        'List documents inside a CMS collection. Returns up to `limit` docs ' +
        '(default 25, max 100). Use this to explore content before reading ' +
        'individual docs.',
      inputSchema: z.object({
        collectionId: z
          .string()
          .describe('Collection id, e.g. "Pages" or "BlogPosts".'),
        mode: z
          .enum(['draft', 'published'])
          .default('draft')
          .describe('Whether to read draft or published versions.'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      execute: async ({collectionId, mode = 'draft', limit = 25}) => {
        const max = clampInt(limit, 1, 100, 25);
        const result = await ctx.cmsClient.listDocs<any>(collectionId, {
          mode,
          limit: max,
        });
        return {
          docs: result.docs.map((d: any) => ({
            id: d.id,
            slug: d.slug,
            sys: unmarshalSys(d.sys),
          })),
        };
      },
    }),

    // TODO: re-enable once search quality improves.
    // docs_search: tool({
    //   description:
    //     'Run a full-text search across all indexed CMS docs. Returns the ' +
    //     'top matching doc ids ordered by relevance.',
    //   inputSchema: z.object({
    //     query: z.string().min(1),
    //     limit: z.number().int().min(1).max(50).default(10),
    //   }),
    //   execute: async ({query, limit = 10}) => {
    //     const max = clampInt(limit, 1, 50, 10);
    //     return await ctx.search(query, {limit: max});
    //   },
    // }),

    doc_get: tool({
      description:
        'Read a single CMS document. Returns the doc fields plus system ' +
        'metadata. Use this when you need the full content of a doc.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
        mode: z.enum(['draft', 'published']).default('draft'),
      }),
      execute: async ({docId, mode = 'draft'}) => {
        const {collection, slug} = parseDocId(docId);
        const raw = await ctx.cmsClient.getRawDoc(collection, slug, {mode});
        if (!raw) {
          return {found: false};
        }
        return {
          found: true,
          doc: {
            id: raw.id,
            collection: raw.collection,
            slug: raw.slug,
            sys: unmarshalSys(raw.sys),
            fields: unmarshalFields(raw.fields),
          },
        };
      },
    }),

    doc_getVersion: tool({
      description:
        'Read a specific version of a CMS document. Use versionId "draft" ' +
        'or "published" for the current draft/published state, or a numeric ' +
        'timestamp for a historical version (from `doc_listVersions`).',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
        versionId: z
          .string()
          .describe(
            'Version identifier: "draft", "published", or a numeric timestamp.'
          ),
      }),
      execute: async ({docId, versionId}) => {
        const {collection, slug} = parseDocId(docId);
        let path: string;
        if (versionId === 'draft') {
          path = `Projects/${ctx.cmsClient.projectId}/Collections/${collection}/Drafts/${slug}`;
        } else if (versionId === 'published') {
          path = `Projects/${ctx.cmsClient.projectId}/Collections/${collection}/Published/${slug}`;
        } else {
          path = `Projects/${ctx.cmsClient.projectId}/Collections/${collection}/Drafts/${slug}/Versions/${versionId}`;
        }
        const snap = await ctx.cmsClient.db.doc(path).get();
        if (!snap.exists) {
          return {found: false};
        }
        const raw = snap.data() as any;
        return {
          found: true,
          doc: {
            id: raw.id,
            collection: raw.collection,
            slug: raw.slug,
            sys: unmarshalSys(raw.sys),
            fields: unmarshalFields(raw.fields),
          },
        };
      },
    }),

    doc_set: tool({
      description:
        'Replace the entire draft fields payload of a CMS document. Pass ' +
        'the full JSON object that should become the new draft contents — ' +
        'any fields omitted will be removed. The payload is validated ' +
        'against the collection schema and the call is rejected on ' +
        'validation errors. Prefer `doc_updateField` for targeted edits. ' +
        'Only writes the draft version; users must publish separately. ' +
        'Format: pass plain JSON. Arrays must be plain JSON arrays — do ' +
        'NOT use the `_array` object notation. The tool marshals the ' +
        'payload into Firestore storage shape on its own. Rich text ' +
        'fields use the `{version, time, blocks}` shape with `blocks` as ' +
        'a plain JSON array of `{type, data}` objects.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
        fields: z
          .record(z.string(), z.any())
          .describe(
            'New fields object. Replaces the existing draft fields entirely.'
          ),
      }),
    }),

    doc_create: tool({
      description:
        'Create a new draft CMS document with the given slug. Fails if the ' +
        'doc already exists. Pass optional initial fields (validated against ' +
        'the collection schema). ' +
        'Format: pass plain JSON for `fields`. Arrays must be plain JSON ' +
        'arrays — do NOT use the `_array` object notation. The tool ' +
        'marshals the payload into Firestore storage shape on its own. ' +
        'Rich text fields use the `{version, time, blocks}` shape with ' +
        '`blocks` as a plain JSON array of `{type, data}` objects.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "BlogPosts/my-new-post").'
          ),
        fields: z
          .record(z.string(), z.any())
          .optional()
          .describe('Optional initial fields for the new doc.'),
      }),
    }),

    doc_updateField: tool({
      description:
        'Update a single field on a draft CMS document by JSON path. ' +
        'Paths are relative to the doc fields object; do not prefix them ' +
        'with "fields.". Use dotted paths (e.g. "hero.title") and ' +
        'zero-based array indices. For example, update the first module ' +
        'title with path "content.modules.0.title". To insert or remove ' +
        'array items, prefer `doc_edit` (it supports insert/remove ' +
        'operations); alternatively set the whole array path here (e.g. ' +
        '"content.modules") to the updated array. The value is ' +
        'validated against the field schema and the call is rejected if the ' +
        'shape is wrong (e.g. passing a string to a richtext field). Only ' +
        'updates the draft version; users must publish separately. ' +
        'Format: pass `value` as plain JSON. Arrays must be plain JSON ' +
        'arrays — do NOT use the `_array` object notation. The tool ' +
        'marshals the value into Firestore storage shape on its own. ' +
        'Rich text fields use the `{version, time, blocks}` shape and ' +
        '`blocks` MUST be a plain JSON array of `{type, data}` objects ' +
        '(never wrapped in `_array`).',
      inputSchema: z.object({
        docId: z.string(),
        path: z
          .string()
          .describe(
            'Dotted JSON path within the fields object, e.g. "content.modules.0.title".'
          ),
        value: z.any().describe('JSON value to set at the path.'),
      }),
    }),

    doc_edit: tool({
      description:
        'Apply multiple edits to a draft CMS document in a single call. ' +
        'Use this when a change spans more than one field or needs to add ' +
        'or remove array items (e.g. append a new module AND update a ' +
        'title). Pass an ordered `operations` list; each operation has an ' +
        '`op`:\n' +
        '- "set": set the value at `path` (e.g. "hero.title" or ' +
        '"content.modules.0.title"). Provide `value`.\n' +
        '- "insert_item": insert `value` into the array at `path` (e.g. ' +
        '"content.modules"). Optionally pass a zero-based `index` to ' +
        'insert before; omit `index` to append.\n' +
        '- "remove_item": remove the array item at zero-based `index` from ' +
        'the array at `path`.\n' +
        'Operations apply in order against the current draft. Array ' +
        'indices in each operation refer to the array state AFTER earlier ' +
        'operations have been applied. The whole result is validated ' +
        'against the collection schema and the call is rejected as a group ' +
        'on any error — nothing is written unless every operation succeeds. ' +
        'Paths are relative to the doc fields object; do not prefix them ' +
        'with "fields.". Use dotted paths and zero-based array indices. ' +
        'Only writes the draft version; users must publish separately. ' +
        'Format: pass `value` as plain JSON. Arrays must be plain JSON ' +
        'arrays — do NOT use the `_array` object notation. The tool ' +
        'marshals values into Firestore storage shape on its own. Rich ' +
        'text fields use the `{version, time, blocks}` shape with `blocks` ' +
        'as a plain JSON array of `{type, data}` objects.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
        operations: z
          .array(
            z.object({
              op: z
                .enum(['set', 'insert_item', 'remove_item'])
                .describe(
                  'Operation: "set" a field value, "insert_item" into an array, or "remove_item" from an array.'
                ),
              path: z
                .string()
                .describe(
                  'Dotted path within the fields object. For "set" it ' +
                    'targets the field to write (e.g. "hero.title"); for ' +
                    '"insert_item"/"remove_item" it targets the array (e.g. ' +
                    '"content.modules").'
                ),
              value: z
                .any()
                .optional()
                .describe(
                  'JSON value. Required for "set" (the new field value) and ' +
                    '"insert_item" (the new array item). Ignored for ' +
                    '"remove_item".'
                ),
              index: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe(
                  'Zero-based array index. For "insert_item" it is the ' +
                    'position to insert before (omit to append); for ' +
                    '"remove_item" it is the item to delete (required).'
                ),
            })
          )
          .min(1)
          .describe('Ordered list of edit operations to apply to the draft.'),
      }),
    }),

    // `doc_publish` and `doc_delete` are intentionally omitted — see the
    // safety policy comment on `createCmsTools`. Users must run these from
    // the CMS UI themselves.

    doc_duplicate: tool({
      description:
        'Duplicate an existing CMS document to a new slug. Copies all ' +
        'draft fields to the target doc id. Fails if the target already ' +
        'exists.',
      inputSchema: z.object({
        fromDocId: z
          .string()
          .describe('Source doc id to copy from (e.g. "Pages/home").'),
        toDocId: z
          .string()
          .describe('Target doc id for the copy (e.g. "Pages/home-copy").'),
      }),
    }),

    // `doc_revertDraft` is intentionally omitted — see the safety policy
    // comment on `createCmsTools`. Discarding draft edits is destructive
    // and must be triggered by the user from the CMS UI.

    doc_listVersions: tool({
      description:
        'List version history for a CMS document. Returns versions ordered ' +
        'by most recent first. Use the versionId from the results with ' +
        '`doc_getVersion` to read a specific version.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({docId, limit = 10}) => {
        const {collection, slug} = parseDocId(docId);
        const max = clampInt(limit, 1, 50, 10);
        const path = `Projects/${ctx.cmsClient.projectId}/Collections/${collection}/Drafts/${slug}/Versions`;
        const snap = await ctx.cmsClient.db
          .collection(path)
          .orderBy('sys.modifiedAt', 'desc')
          .limit(max)
          .get();
        return {
          versions: snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              versionId: d.id,
              sys: unmarshalSys(data.sys),
              tags: data.tags || [],
              publishMessage: data.publishMessage,
            };
          }),
        };
      },
    }),

    doc_translateField: tool({
      description:
        'Translate a text value into one or more target locales using AI. ' +
        'Returns the translated strings keyed by locale. Use this to help ' +
        'with localization workflows.',
      inputSchema: z.object({
        sourceText: z.string().min(1).describe('The source text to translate.'),
        targetLocales: z
          .array(z.string())
          .min(1)
          .describe(
            'Array of locale codes to translate into (e.g. ["es", "fr", "de"]).'
          ),
        description: z
          .string()
          .optional()
          .describe(
            'Optional context about the text to improve translation quality.'
          ),
      }),
    }),

    schema_get: tool({
      description:
        'Get the field schema for a CMS collection. Returns the full field ' +
        'definitions including types, labels, and validation rules. Use this ' +
        'to understand what fields a collection supports before creating or ' +
        'editing docs.',
      inputSchema: z.object({
        collectionId: z
          .string()
          .describe('Collection id, e.g. "Pages" or "BlogPosts".'),
      }),
      execute: async ({collectionId}) => {
        const schema = await ctx.loadCollection(collectionId);
        if (!schema) {
          return {found: false, collectionId};
        }
        return {
          found: true,
          collectionId,
          fields: simplifyFields(schema.fields || []),
        };
      },
    }),
  };
}

/** Parses a docId like "Pages/home" into `{collection, slug}`. */
function parseDocId(docId: string): {collection: string; slug: string} {
  const idx = docId.indexOf('/');
  if (idx <= 0 || idx === docId.length - 1) {
    throw new Error(`invalid docId: "${docId}" (expected "Collection/slug")`);
  }
  return {
    collection: docId.slice(0, idx),
    slug: normalizeSlug(docId.slice(idx + 1)),
  };
}

/** Clamp `value` into `[min, max]`, falling back to `fallback` on NaN. */
function clampInt(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Unmarshal a doc's `sys` block from Firestore Admin representation.
 *
 * The default duck-typing in `shared/marshal.unmarshalData` calls `toMillis()`
 * on anything that has it, which covers both client and Admin SDK Timestamps.
 */
function unmarshalSys(sys: unknown): Record<string, unknown> {
  return unmarshalData(sys ?? {}) as Record<string, unknown>;
}

/** Unmarshal a doc's `fields` block (drops `_arrayKey` arrays into arrays). */
function unmarshalFields(fields: unknown): Record<string, unknown> {
  return unmarshalData(fields ?? {}) as Record<string, unknown>;
}

/**
 * Reduces a collection's field definitions down to the bits the model needs
 * (id, type, label, options, nested shape). Drops Root-internal metadata
 * (preview, conditional visibility, default UI widget hints, etc.) since
 * those would bloat the model context without adding decision-useful info.
 */
function simplifyFields(fields: Field[]): unknown[] {
  return fields.map((f: any) => {
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

/**
 * Validates `value` against the field schema located at `path` within
 * `collection`. Returns validation errors if the field can be resolved and
 * the value doesn't match its expected shape. If the field cannot be located
 * (e.g. the path walks through a `oneof` with an unknown discriminator),
 * returns an empty array to fall back to "no validation" rather than
 * blocking the write.
 */
export function validateValueAtPath(
  collection: Collection,
  path: string,
  value: any
): Array<{path: string; message: string; expected?: string; received?: any}> {
  const resolution = resolveFieldAtPath(collection, path);
  if (resolution.error) {
    return [resolution.error];
  }
  const field = resolution.field;
  if (!field) {
    return [];
  }
  return validateValue(value, field, path);
}

export {validateFields};

/**
 * Walks `schema` to find the field declaration at `path`. Numeric segments
 * traverse arrays; non-numeric segments traverse object/oneof fields.
 * Unresolvable schema paths return `{field: null}` so callers can fall back to
 * "no validation"; malformed array paths return a validation error.
 */
function resolveFieldAtPath(
  schema: Schema,
  path: string
): {field: Field | null; error?: ValidationError} {
  const syntaxError = validatePathSyntax(path);
  if (syntaxError) {
    return {field: null, error: syntaxError};
  }

  const segments = path.trim().split('.');
  if (segments.length === 0) {
    return {field: null};
  }

  let currentFields: Field[] = schema.fields || [];
  let currentField: Field | null = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentPath = segments.slice(0, i + 1).join('.');
    const isNumeric = /^\d+$/.test(segment);
    const isIndex = /^(0|[1-9]\d*)$/.test(segment);

    if (isNumeric && !isIndex) {
      return {
        field: null,
        error: createPathError(
          segmentPath,
          'Array indices must be zero-based numeric path segments without leading zeros.',
          'array index',
          segment
        ),
      };
    }

    if (isIndex) {
      // Expect the previous field to be an array.
      if (!currentField || currentField.type !== 'array') {
        return {
          field: null,
          error: createPathError(
            segmentPath,
            'Array index path segments can only be used after an array field.',
            'array field',
            currentField?.type || 'root'
          ),
        };
      }
      const arrayField = currentField as ArrayField;
      const itemField = arrayField.of as Field;
      currentField = itemField;
      currentFields =
        itemField.type === 'object' ? (itemField as ObjectField).fields : [];
      continue;
    }

    if (currentField?.type === 'array') {
      return {
        field: null,
        error: createPathError(
          segmentPath,
          'Array fields must be followed by a zero-based numeric index before nested fields.',
          'array index',
          segment
        ),
      };
    }

    // Object or oneof: look up by id.
    let next: Field | undefined = currentFields.find((f) => f.id === segment);
    if (!next && currentField?.type === 'oneof') {
      // Try each variant's fields.
      const oneOf = currentField as OneOfField;
      const types = Array.isArray(oneOf.types) ? (oneOf.types as Schema[]) : [];
      for (const t of types) {
        if (typeof t === 'string') continue;
        const found = (t.fields || []).find((f) => f.id === segment);
        if (found) {
          next = found;
          break;
        }
      }
    }
    if (!next) {
      return {field: null};
    }
    currentField = next;
    if (next.type === 'object') {
      currentFields = (next as ObjectField).fields;
    } else if (next.type === 'array') {
      currentFields = [];
    } else {
      currentFields = [];
    }
  }

  return {field: currentField};
}

function validatePathSyntax(path: string): ValidationError | null {
  const trimmed = path.trim();
  if (!trimmed) {
    return createPathError(
      path,
      'Path is required and must be relative to the doc fields object.',
      'non-empty field path',
      path
    );
  }

  const segments = trimmed.split('.');
  if (segments.some((segment) => segment.length === 0)) {
    return createPathError(
      path,
      'Path must use dotted field segments without empty segments.',
      'dotted field path',
      path
    );
  }

  if (segments[0] === 'fields') {
    return createPathError(
      path,
      'Path must be relative to the fields object; remove the leading "fields." prefix.',
      'field path without fields prefix',
      path
    );
  }

  if (segments.some((segment) => /[[\]]/.test(segment))) {
    return createPathError(
      path,
      'Use dotted zero-based array indices, e.g. "content.modules.0.title".',
      'dotted array index path',
      path
    );
  }

  return null;
}

function createPathError(
  path: string,
  message: string,
  expected: string,
  received: any
): ValidationError {
  return {
    path,
    message,
    expected,
    received,
  };
}

/** A single edit operation handled by the `doc_edit` tool. */
export interface DocEditOperation {
  op: 'set' | 'insert_item' | 'remove_item';
  /** Dotted path within the fields object (no leading "fields." prefix). */
  path: string;
  /** Value to write ("set") or insert ("insert_item"). Unused for "remove_item". */
  value?: any;
  /** Zero-based array index for "insert_item" (optional) and "remove_item" (required). */
  index?: number;
}

/** A structural failure applying one operation in a `doc_edit` batch. */
export interface DocEditError {
  /** Zero-based position of the failing operation in the input list. */
  opIndex: number;
  op: string;
  path: string;
  message: string;
  expected?: string;
  received?: any;
}

export type ApplyDocEditsResult =
  | {ok: true; fields: Record<string, any>}
  | {ok: false; error: DocEditError};

const INDEX_RE = /^(0|[1-9]\d*)$/;

/**
 * Applies a sequence of `doc_edit` operations to a plain-JSON `fields` object
 * and returns the resulting fields, or the first operation that failed.
 *
 * Pure: the input is deep-cloned and never mutated, so callers can validate
 * the result against the collection schema (via `validateFields`) before
 * persisting. Operations run in order — array indices in each op refer to the
 * array state after earlier ops have been applied.
 *
 * This performs structural checks only (path resolves against the current
 * data, the target is an array for insert_item/remove_item, the index is in
 * range). Type/schema validation is the caller's responsibility.
 */
export function applyDocEdits(
  fields: Record<string, any>,
  operations: DocEditOperation[]
): ApplyDocEditsResult {
  const draft: Record<string, any> = JSON.parse(JSON.stringify(fields ?? {}));
  for (let i = 0; i < operations.length; i++) {
    const error = applyOneEdit(draft, operations[i], i);
    if (error) {
      return {ok: false, error};
    }
  }
  return {ok: true, fields: draft};
}

function applyOneEdit(
  draft: Record<string, any>,
  op: DocEditOperation,
  opIndex: number
): DocEditError | null {
  if (op.op !== 'set' && op.op !== 'insert_item' && op.op !== 'remove_item') {
    return makeEditError(
      opIndex,
      op,
      typeof op.path === 'string' ? op.path : String(op.path),
      `Unknown operation "${op.op}".`,
      'set | insert_item | remove_item',
      op.op
    );
  }

  if (typeof op.path !== 'string') {
    return makeEditError(
      opIndex,
      op,
      String(op.path),
      'Operation `path` must be a string.',
      'string',
      typeName(op.path)
    );
  }

  const syntax = validatePathSyntax(op.path);
  if (syntax) {
    return {opIndex, op: op.op, ...syntax};
  }
  const segments = op.path.trim().split('.');
  const lastSeg = segments[segments.length - 1];
  const childPath = op.path.trim();
  const lastIsIndex = INDEX_RE.test(lastSeg);

  // For "remove_item" the array (and the whole path) must already exist;
  // "set" and "insert_item" may create intermediate containers on the way.
  const parent = navigateToParent(draft, segments, op.op !== 'remove_item');
  if (!parent.ok) {
    return {opIndex, op: op.op, ...parent.error};
  }
  const container = parent.container;

  if (op.op === 'set') {
    if (op.value === undefined) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'A "set" operation requires a `value`.',
        'value',
        'undefined'
      );
    }
    if (Array.isArray(container)) {
      if (!lastIsIndex) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Use a zero-based array index to set an array item.',
          'array index',
          lastSeg
        );
      }
      const idx = Number(lastSeg);
      if (idx > container.length) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Array index is out of range; set an existing index or append at the array length.',
          `0..${container.length}`,
          idx
        );
      }
      container[idx] = op.value;
      return null;
    }
    if (container && typeof container === 'object') {
      if (lastIsIndex) {
        return makeEditError(
          opIndex,
          op,
          childPath,
          'Array index used on a non-array field.',
          'object key',
          lastSeg
        );
      }
      container[lastSeg] = op.value;
      return null;
    }
    return makeEditError(
      opIndex,
      op,
      childPath,
      'Cannot set a value here; the parent is not an object or array.',
      'object or array',
      typeName(container)
    );
  }

  // insert_item / remove_item target the ARRAY located at op.path.
  let arr = getChild(container, lastSeg, lastIsIndex);

  if (op.op === 'insert_item') {
    if (op.value === undefined) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'An "insert_item" operation requires a `value`.',
        'value',
        'undefined'
      );
    }
    if (arr === undefined || arr === null) {
      arr = [];
      const setError = setChild(
        container,
        lastSeg,
        lastIsIndex,
        arr,
        opIndex,
        op
      );
      if (setError) {
        return setError;
      }
    }
    if (!Array.isArray(arr)) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'The target of an "insert_item" must be an array field.',
        'array',
        typeName(arr)
      );
    }
    const at = op.index === undefined ? arr.length : op.index;
    if (at < 0 || at > arr.length) {
      return makeEditError(
        opIndex,
        op,
        childPath,
        'Insert index is out of range.',
        `0..${arr.length}`,
        at
      );
    }
    arr.splice(at, 0, op.value);
    return null;
  }

  // remove_item
  if (!Array.isArray(arr)) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'The target of a "remove_item" must be an array field.',
      'array',
      typeName(arr)
    );
  }
  if (op.index === undefined) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'A "remove_item" operation requires an `index`.',
      'index',
      'undefined'
    );
  }
  if (op.index < 0 || op.index >= arr.length) {
    return makeEditError(
      opIndex,
      op,
      childPath,
      'Remove index is out of range.',
      `0..${Math.max(arr.length - 1, 0)}`,
      op.index
    );
  }
  arr.splice(op.index, 1);
  return null;
}

interface PathFailure {
  path: string;
  message: string;
  expected?: string;
  received?: any;
}

/**
 * Walks `root` through every segment except the last and returns the parent
 * container of the final segment. When `create` is true, missing intermediate
 * object/array containers are created on the way down.
 */
function navigateToParent(
  root: any,
  segments: string[],
  create: boolean
): {ok: true; container: any} | {ok: false; error: PathFailure} {
  let cur = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const segPath = segments.slice(0, i + 1).join('.');
    const isIndex = INDEX_RE.test(seg);
    if (Array.isArray(cur)) {
      if (!isIndex) {
        return pathFail(
          segPath,
          'Expected a zero-based array index after an array field.',
          'array index',
          seg
        );
      }
      const idx = Number(seg);
      if (idx >= cur.length) {
        return pathFail(
          segPath,
          'Array index is out of range for the current draft.',
          `0..${Math.max(cur.length - 1, 0)}`,
          idx
        );
      }
      cur = cur[idx];
      continue;
    }
    if (cur === null || typeof cur !== 'object') {
      return pathFail(
        segPath,
        'Path walks through a value that is not an object or array.',
        'object or array',
        typeName(cur)
      );
    }
    if (isIndex) {
      return pathFail(
        segPath,
        'Array index used on a non-array field.',
        'object key',
        seg
      );
    }
    if (cur[seg] === undefined || cur[seg] === null) {
      if (!create) {
        return pathFail(
          segPath,
          'Path segment does not exist in the current draft.',
          'existing field',
          seg
        );
      }
      cur[seg] = INDEX_RE.test(segments[i + 1]) ? [] : {};
    }
    cur = cur[seg];
  }
  return {ok: true, container: cur};
}

function getChild(container: any, seg: string, isIndex: boolean): any {
  if (Array.isArray(container)) {
    return isIndex ? container[Number(seg)] : undefined;
  }
  if (container && typeof container === 'object') {
    return container[seg];
  }
  return undefined;
}

function setChild(
  container: any,
  seg: string,
  isIndex: boolean,
  value: any,
  opIndex: number,
  op: DocEditOperation
): DocEditError | null {
  if (Array.isArray(container)) {
    if (!isIndex) {
      return makeEditError(
        opIndex,
        op,
        op.path.trim(),
        'Use a zero-based array index for an array field.',
        'array index',
        seg
      );
    }
    container[Number(seg)] = value;
    return null;
  }
  if (container && typeof container === 'object') {
    if (isIndex) {
      return makeEditError(
        opIndex,
        op,
        op.path.trim(),
        'Array index used on a non-array field.',
        'object key',
        seg
      );
    }
    container[seg] = value;
    return null;
  }
  return makeEditError(
    opIndex,
    op,
    op.path.trim(),
    'Cannot write here; the parent is not an object or array.',
    'object or array',
    typeName(container)
  );
}

function pathFail(
  path: string,
  message: string,
  expected: string,
  received: any
): {ok: false; error: PathFailure} {
  return {ok: false, error: {path, message, expected, received}};
}

function makeEditError(
  opIndex: number,
  op: DocEditOperation,
  path: string,
  message: string,
  expected?: string,
  received?: any
): DocEditError {
  return {opIndex, op: op.op, path, message, expected, received};
}

function typeName(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
