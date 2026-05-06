/**
 * Built-in CMS tools exposed to the chat model on the `/cms/ai` page.
 *
 * Tools are defined here as schema-only declarations (no `execute`). The
 * server passes them through to `streamText`, the model emits tool calls,
 * and the browser executes them via `onToolCall` in `useChat`. This means:
 *
 * - Reads/writes happen with the signed-in user's Firebase credentials and
 *   respect Firestore security rules.
 * - Other connected clients see writes in real time via Firestore listeners.
 * - The server stays a thin streaming proxy.
 *
 * Validation helpers (`validateFields`, `validateValueAtPath`) live here
 * too so the client can run the same checks the old server-side tools did.
 */
import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {
  ArrayField,
  Collection,
  Field,
  ObjectField,
  OneOfField,
  Schema,
} from './schema.js';
import {validateFields, validateValue} from './validation.js';

/** Tool ids handled client-side. Kept in sync with the schemas below. */
export const CMS_TOOL_NAMES = [
  'collections_list',
  'docs_list',
  'docs_search',
  'doc_get',
  'doc_getVersion',
  'doc_set',
  'doc_create',
  'doc_updateField',
  'doc_publish',
  'doc_delete',
  'doc_duplicate',
  'doc_revertDraft',
  'doc_listVersions',
  'doc_translateField',
  'schema_get',
] as const;
export type CmsToolName = (typeof CMS_TOOL_NAMES)[number];

/**
 * Schema-only tool definitions. The server passes these to `streamText` so
 * the model knows the contract; the browser provides the actual `execute`.
 *
 * Safety policy: this tool set is intentionally read + draft-write only.
 * The following operations are deliberately NOT exposed to the model
 * because they are publishing-related, destructive, or otherwise
 * irreversible. Surfacing them would let a single hallucinated tool call
 * affect the live site or wipe authored content. Users must perform these
 * actions themselves through the regular CMS UI:
 *
 *   - `publishDoc` / `unpublishDoc` — promote/demote a draft to/from
 *     production. Always user-initiated.
 *   - `deleteDoc` — permanent removal of a doc.
 *   - `revertDraft` — discards in-progress draft edits.
 *   - `scheduleDoc` / `unscheduleDoc` — affects future production state.
 *   - `lockPublishing` / `unlockPublishing` — affects governance state.
 *   - `restoreVersion` — overwrites the current draft with old data.
 *   - Bulk variants (`publishDocs`, etc.) of any of the above.
 *
 * If you add new write tools here, keep them limited to draft-mode edits
 * the user can easily review before publishing.
 */
export function createCmsTools(): ToolSet {
  return {
    'collections_list': tool({
      description:
        'List all CMS collections defined in the project. Returns each ' +
        'collection id along with optional name/description metadata.',
      inputSchema: z.object({}),
    }),

    'docs_list': tool({
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
    }),

    'docs_search': tool({
      description:
        'Run a full-text search across all indexed CMS docs. Returns the ' +
        'top matching doc ids ordered by relevance.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    }),

    'doc_get': tool({
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
    }),

    'doc_getVersion': tool({
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
    }),

    'doc_set': tool({
      description:
        'Replace the entire draft fields payload of a CMS document. Pass ' +
        'the full JSON object that should become the new draft contents — ' +
        'any fields omitted will be removed. The payload is validated ' +
        'against the collection schema and the call is rejected on ' +
        'validation errors. Prefer `doc_updateField` for targeted edits. ' +
        'Only writes the draft version; users must publish separately. ' +
        'Always confirm with the user before calling.',
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

    'doc_create': tool({
      description:
        'Create a new draft CMS document with the given slug. Fails if the ' +
        'doc already exists. Pass optional initial fields (validated against ' +
        'the collection schema). Always confirm with the user before calling.',
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

    'doc_updateField': tool({
      description:
        'Update a single field on a draft CMS document by JSON path. ' +
        'Use dotted paths (e.g. "hero.title") and array indices (e.g. ' +
        '"sections.0.heading"). The value is validated against the field ' +
        'schema and the call is rejected if the shape is wrong (e.g. ' +
        'passing a string to a richtext field). Only updates the draft ' +
        'version; users must publish separately. Always confirm with the ' +
        'user before calling.',
      inputSchema: z.object({
        docId: z.string(),
        path: z.string().describe('Dotted JSON path within the fields object.'),
        value: z.any().describe('JSON value to set at the path.'),
      }),
    }),

    'doc_publish': tool({
      description:
        'Publish a draft CMS document, making it live. This copies the ' +
        'current draft to the published version and saves a version ' +
        'snapshot. Always confirm with the user before calling.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
      }),
    }),

    'doc_delete': tool({
      description:
        'Delete a CMS document (draft, published, and scheduled versions). ' +
        'This is irreversible. Always confirm with the user before calling.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
      }),
    }),

    'doc_duplicate': tool({
      description:
        'Duplicate an existing CMS document to a new slug. Copies all ' +
        'draft fields to the target doc id. Fails if the target already ' +
        'exists. Always confirm with the user before calling.',
      inputSchema: z.object({
        fromDocId: z
          .string()
          .describe('Source doc id to copy from (e.g. "Pages/home").'),
        toDocId: z
          .string()
          .describe(
            'Target doc id for the copy (e.g. "Pages/home-copy").'
          ),
      }),
    }),

    'doc_revertDraft': tool({
      description:
        'Revert the draft of a CMS document back to its last published ' +
        'version. Discards all unpublished changes. Fails if the doc has ' +
        'never been published. Always confirm with the user before calling.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe(
            'Full doc id in the form "Collection/slug" (e.g. "Pages/home").'
          ),
      }),
    }),

    'doc_listVersions': tool({
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
    }),

    'doc_translateField': tool({
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

    'schema_get': tool({
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
    }),
  };
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
  const field = resolveFieldAtPath(collection, path);
  if (!field) {
    return [];
  }
  return validateValue(value, field, path);
}

export {validateFields};

/**
 * Walks `schema` to find the field declaration at `path`. Numeric segments
 * traverse arrays; non-numeric segments traverse object/oneof fields. Returns
 * `null` if the path can't be resolved (e.g. it dives into a `richtext`
 * payload or a `oneof` whose discriminator we can't determine).
 */
function resolveFieldAtPath(schema: Schema, path: string): Field | null {
  const segments = path.split('.').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return null;
  }

  let currentFields: Field[] = schema.fields || [];
  let currentField: Field | null = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isIndex = /^\d+$/.test(segment);

    if (isIndex) {
      // Expect the previous field to be an array.
      if (!currentField || currentField.type !== 'array') {
        return null;
      }
      const arrayField = currentField as ArrayField;
      const itemField = arrayField.of as Field;
      currentField = itemField;
      currentFields =
        itemField.type === 'object' ? (itemField as ObjectField).fields : [];
      continue;
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
      return null;
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

  return currentField;
}
