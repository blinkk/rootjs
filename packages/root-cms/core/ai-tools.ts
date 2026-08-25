/**
 * Built-in CMS tools exposed to the chat model on the `/cms/ai` page.
 *
 * Read tools (`doc_get`, `docs_list`, etc.) run their `execute` against a
 * pluggable `CmsToolReadBackend`. The `/cms/ai` chat now streams directly from
 * the browser, so the client supplies a Firebase-web-SDK backend (see
 * `ui/components/RootAIChat/clientCmsTools.ts`). The factory itself is
 * data-source agnostic.
 *
 * Write tools (`doc_set`, `doc_create`, `doc_updateField`, `doc_duplicate`,
 * `release_create`, `release_update`) stay schema-only here — the browser
 * executes them via `onToolCall` so the user can approve diffs in the UI and
 * so Firestore listeners on other tabs see the change immediately.
 *
 * Validation helpers (`validateFields`, `validateValueAtPath`) live here
 * too so both browser and server can share the same checks.
 *
 * Browser-import safety: this module is imported by the browser bundle, so it
 * must not pull server-only modules (`firebase-admin`, `node:*`) into runtime
 * imports. The backend implementation is injected at call time.
 */
import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {createPathError, validatePathSyntax} from './doc-edits.js';
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

// The doc-edit engine moved to `./doc-edits.js` so it can be used without
// pulling in the AI SDK. Re-exported here for backwards compatibility.
export {
  applyDocEdits,
  type ApplyDocEditsResult,
  type DocEditError,
  type DocEditOperation,
} from './doc-edits.js';

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
  'releases_list',
  'release_get',
  'release_create',
  'release_update',
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
  'releases_list',
  'release_get',
] as const;

/** A CMS document shaped for the model (fields/sys already unmarshalled). */
export interface CmsToolDoc {
  id: string;
  collection: string;
  slug: string;
  sys: Record<string, unknown>;
  fields: Record<string, unknown>;
}

/** Lightweight doc summary returned by `docs_list`. */
export interface CmsToolDocSummary {
  id: string;
  slug: string;
  sys: Record<string, unknown>;
}

/** Version summary returned by `doc_listVersions`. */
export interface CmsToolVersionSummary {
  versionId: string;
  sys: Record<string, unknown>;
  tags: string[];
  publishMessage?: string;
}

/** Collection summary returned by `collections_list`. */
export interface CmsToolCollectionSummary {
  id: string;
  name?: string;
  description?: string;
}

/** Lifecycle status of a release, derived via `getReleaseStatus()`. */
export type CmsToolReleaseStatus =
  | 'unpublished'
  | 'scheduled'
  | 'published'
  | 'archived';

/** A CMS release shaped for the model (timestamps in epoch millis). */
export interface CmsToolRelease {
  id: string;
  description?: string;
  /** Full doc ids (e.g. "Pages/home") published together by this release. */
  docIds: string[];
  /** Data source ids published with the release. Managed via the CMS UI. */
  dataSourceIds: string[];
  status: CmsToolReleaseStatus;
  createdAt?: number;
  createdBy?: string;
  scheduledAt?: number;
  scheduledBy?: string;
  publishedAt?: number;
  publishedBy?: string;
  archivedAt?: number;
  archivedBy?: string;
}

/**
 * Derives the lifecycle status of a release from its stamp fields. Archived
 * wins over everything (an archived release can never be published), then
 * published (publishing clears `scheduledAt`), then scheduled.
 */
export function getReleaseStatus(release: {
  archivedAt?: unknown;
  publishedAt?: unknown;
  scheduledAt?: unknown;
}): CmsToolReleaseStatus {
  if (release.archivedAt) {
    return 'archived';
  }
  if (release.publishedAt) {
    return 'published';
  }
  if (release.scheduledAt) {
    return 'scheduled';
  }
  return 'unpublished';
}

/**
 * Computes the new `docIds` list for a `release_update` call: the existing
 * ids plus `addDocIds` minus `removeDocIds`, deduped and sorted (matching how
 * the CMS UI maintains the list). Removal wins when an id appears in both.
 */
export function computeReleaseDocIds(
  existingDocIds: string[],
  addDocIds?: string[],
  removeDocIds?: string[]
): string[] {
  const ids = new Set(existingDocIds);
  for (const docId of addDocIds || []) {
    ids.add(docId);
  }
  for (const docId of removeDocIds || []) {
    ids.delete(docId);
  }
  return Array.from(ids).sort();
}

/**
 * Data-source backing the read tools. Implemented server-side (Firebase Admin)
 * or in the browser (Firebase web SDK — see `clientCmsTools.ts`). The factory
 * is agnostic to where the reads run.
 *
 * Implementations own docId parsing and unmarshalling so the tool `execute`
 * blocks stay thin and the returned shapes are model-ready.
 */
export interface CmsToolReadBackend {
  /** Lists all collections with optional name/description metadata. */
  listCollections(): Promise<CmsToolCollectionSummary[]>;
  /** Lists docs in a collection (draft or published). */
  listDocs(
    collectionId: string,
    options: {mode: 'draft' | 'published'; limit: number}
  ): Promise<CmsToolDocSummary[]>;
  /** Reads a single doc, or `null` if it does not exist. */
  getDoc(
    docId: string,
    options: {mode: 'draft' | 'published'}
  ): Promise<CmsToolDoc | null>;
  /**
   * Reads a specific version of a doc. `versionId` is "draft", "published" or
   * a numeric timestamp. Returns `null` if it does not exist.
   */
  getDocVersion(docId: string, versionId: string): Promise<CmsToolDoc | null>;
  /** Lists a doc's version history, most recent first. */
  listVersions(
    docId: string,
    options: {limit: number}
  ): Promise<CmsToolVersionSummary[]>;
  /**
   * Returns the simplified field definitions for a collection (see
   * `simplifyFields`), or `null` if the collection is unknown.
   */
  getSchemaFields(collectionId: string): Promise<unknown[] | null>;
  /** Lists releases, most recently created first. */
  listReleases(options: {limit: number}): Promise<CmsToolRelease[]>;
  /** Reads a single release, or `null` if it does not exist. */
  getRelease(releaseId: string): Promise<CmsToolRelease | null>;
}

/**
 * Returns a `ToolSet` filtered to only the read-only CMS tools. Use this in
 * flows where the AI assists with proposing changes that the user reviews
 * and saves manually (so the model can read context but cannot mutate data).
 */
export function createReadOnlyCmsTools(backend: CmsToolReadBackend): ToolSet {
  const all = createCmsTools(backend);
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
 * `doc_getVersion`, `doc_listVersions`, `schema_get`, `releases_list`,
 * `release_get`) carry an `execute` that delegates to the supplied
 * `CmsToolReadBackend`. Write tools (`doc_set`, `doc_create`,
 * `doc_updateField`, `doc_duplicate`, `doc_translateField`,
 * `release_create`, `release_update`) remain schema-only — the browser
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
 *   - `release_publish` / `release_schedule` / `release_unschedule` —
 *     pushes the release's docs to production (now or at a future time).
 *   - `release_delete` / `release_archive` / `release_unarchive` —
 *     destructive/governance state on releases.
 *   - Bulk variants (e.g. `docs_publish`) of any of the above.
 *
 * `release_create` and `release_update` are exposed because grouping docs
 * into a release publishes nothing by itself — but the client handlers
 * restrict `release_update` to UNPUBLISHED releases, since editing the doc
 * list of a scheduled release would change what auto-publishes at the
 * scheduled time (equivalent to `doc_schedule`, which is excluded above).
 *
 * If you add new write tools here, keep them limited to draft-mode edits
 * (or similarly non-publishing changes) the user can easily review before
 * publishing.
 */
export function createCmsTools(backend: CmsToolReadBackend): ToolSet {
  return {
    collections_list: tool({
      description:
        'List all CMS collections defined in the project. Returns each ' +
        'collection id along with optional name/description metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        return {collections: await backend.listCollections()};
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
        return {docs: await backend.listDocs(collectionId, {mode, limit: max})};
      },
    }),

    // TODO: re-enable once search quality improves.
    // docs_search: tool({ ... }),

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
        const doc = await backend.getDoc(docId, {mode});
        return doc ? {found: true, doc} : {found: false};
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
        const doc = await backend.getDocVersion(docId, versionId);
        return doc ? {found: true, doc} : {found: false};
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
        const max = clampInt(limit, 1, 50, 10);
        return {versions: await backend.listVersions(docId, {limit: max})};
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
        const fields = await backend.getSchemaFields(collectionId);
        if (!fields) {
          return {found: false, collectionId};
        }
        return {found: true, collectionId, fields};
      },
    }),

    releases_list: tool({
      description:
        'List CMS releases, most recently created first. A release is a ' +
        'named group of docs (and data sources) that the user can publish ' +
        'together, immediately or at a scheduled time. Each result ' +
        'includes the release status ("unpublished", "scheduled", ' +
        '"published" or "archived") and its doc ids.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
      execute: async ({limit = 50}) => {
        const max = clampInt(limit, 1, 100, 50);
        return {releases: await backend.listReleases({limit: max})};
      },
    }),

    release_get: tool({
      description:
        'Read a single CMS release, including its status, description, ' +
        'doc ids, and schedule/publish metadata.',
      inputSchema: z.object({
        releaseId: z
          .string()
          .describe('Release id, e.g. "20260318-golden-meadow".'),
      }),
      execute: async ({releaseId}) => {
        const release = await backend.getRelease(releaseId);
        return release ? {found: true, release} : {found: false};
      },
    }),

    release_create: tool({
      description:
        'Create a new CMS release with an optional description and ' +
        'initial list of doc ids. Doc ids use the full "Collection/slug" ' +
        'form and every doc must already exist as a draft. Fails if the ' +
        'release id is already taken. Creating a release does NOT publish ' +
        'anything — the user publishes or schedules the release from the ' +
        'CMS UI. Requires publish permissions (ADMIN or EDITOR role).',
      inputSchema: z.object({
        releaseId: z
          .string()
          .describe(
            'Release id using lowercase letters, numbers and dashes, ' +
              'e.g. "spring-launch" or "20260318-golden-meadow".'
          ),
        description: z
          .string()
          .optional()
          .describe('Optional description shown in the releases UI.'),
        docIds: z
          .array(z.string())
          .optional()
          .describe('Doc ids to include in the release, e.g. ["Pages/home"].'),
      }),
    }),

    release_update: tool({
      description:
        'Update an UNPUBLISHED CMS release: add docs, remove docs, and/or ' +
        'change the description. Pass full doc ids (e.g. "Pages/home"); ' +
        'added docs must already exist as drafts. Scheduled, published and ' +
        'archived releases cannot be edited with this tool — the user must ' +
        'manage those from the CMS UI (e.g. unschedule first). Updating a ' +
        'release does NOT publish anything — publishing remains manual. ' +
        'Requires publish permissions (ADMIN or EDITOR role).',
      inputSchema: z.object({
        releaseId: z.string().describe('Release id to update.'),
        description: z
          .string()
          .optional()
          .describe('New description for the release.'),
        addDocIds: z
          .array(z.string())
          .optional()
          .describe('Doc ids to add to the release.'),
        removeDocIds: z
          .array(z.string())
          .optional()
          .describe('Doc ids to remove from the release.'),
      }),
    }),
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
 * Reduces a collection's field definitions down to the bits the model needs
 * (id, type, label, options, nested shape). Drops Root-internal metadata
 * (preview, conditional visibility, default UI widget hints, etc.) since
 * those would bloat the model context without adding decision-useful info.
 *
 * Exported so the browser backend can shape `schema_get` results the same way.
 */
export function simplifyFields(fields: Field[]): unknown[] {
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
