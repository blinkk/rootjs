/**
 * Server-side `execute` implementations for the read bundle of CMS tools.
 *
 * These wrap `RootCMSClient` (admin Firestore) so background agent runs can
 * fetch context without round-tripping through the browser. They mirror the
 * client-side handlers in `ui/pages/AIPage/cmsToolHandlers.ts` but are
 * scoped server-side and therefore project-bound.
 *
 * Mutating tools are deliberately not implemented here. Agents propose
 * mutations via `proposeChange` (see `tools-propose.ts`); the actual
 * mutation runs in the user's browser session under their Firebase auth
 * after a human clicks "Apply".
 */

import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {SearchIndexService} from '../search-index.js';
import type {AgentRunContext} from './run-context.js';

/**
 * Builds the read-bundle ToolSet with server-side `execute` functions wired
 * to the project-scoped CMS client.
 */
export function createServerReadTools(ctx: AgentRunContext): ToolSet {
  return {
    collections_list: tool({
      description:
        'List all CMS collections defined in the project. Returns each ' +
        'collection id along with optional name/description metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        // Lazy import to keep the virtual-module dependency optional at
        // module load time (tests stub it; production loads via Vite SSR).
        const {getProjectCollections} = await import('./project-helpers.js');
        return {collections: await getProjectCollections()};
      },
    }),

    docs_list: tool({
      description:
        'List documents inside a CMS collection. Returns up to `limit` docs ' +
        '(default 25, max 100).',
      inputSchema: z.object({
        collectionId: z.string(),
        mode: z.enum(['draft', 'published']).default('draft'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      execute: async ({collectionId, mode, limit}) => {
        const {docs} = await ctx.cmsClient.listDocs<Record<string, unknown>>(
          collectionId,
          {mode, limit}
        );
        return {
          docs: docs.map((d) => ({
            id: (d as {id?: string}).id,
            slug: (d as {slug?: string}).slug,
            sys: (d as {sys?: unknown}).sys,
          })),
        };
      },
    }),

    docs_search: tool({
      description:
        'Run a full-text search across all indexed CMS docs. Returns the ' +
        'top matching docs ordered by relevance.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({query, limit}) => {
        const service = new SearchIndexService(ctx.cmsClient.rootConfig);
        const result = await service.search(query, {limit});
        return result;
      },
    }),

    doc_get: tool({
      description:
        'Read a single CMS document. Returns the doc fields plus system ' +
        'metadata.',
      inputSchema: z.object({
        docId: z.string(),
        mode: z.enum(['draft', 'published']).default('draft'),
      }),
      execute: async ({docId, mode}) => {
        const {collection, slug} = parseDocId(docId);
        const doc = await ctx.cmsClient.getDoc(collection, slug, {mode});
        if (!doc) {
          return {found: false};
        }
        return {found: true, doc};
      },
    }),

    doc_getVersion: tool({
      description:
        'Read a specific version of a CMS document. Use versionId "draft" ' +
        'or "published" for current state, or a numeric timestamp for a ' +
        'historical version.',
      inputSchema: z.object({
        docId: z.string(),
        versionId: z.string(),
      }),
      execute: async ({docId, versionId}) => {
        const {collection, slug} = parseDocId(docId);
        const path = versionDocPath(ctx.projectId, collection, slug, versionId);
        const snap = await ctx.db.doc(path).get();
        if (!snap.exists) {
          return {found: false};
        }
        return {found: true, doc: snap.data()};
      },
    }),

    doc_listVersions: tool({
      description:
        'List version history for a CMS document. Returns versions ordered ' +
        'by most recent first.',
      inputSchema: z.object({
        docId: z.string(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({docId, limit}) => {
        const {collection, slug} = parseDocId(docId);
        const path = `Projects/${ctx.projectId}/Collections/${collection}/Drafts/${slug}/Versions`;
        const snap = await ctx.db
          .collection(path)
          .orderBy('sys.modifiedAt', 'desc')
          .limit(limit)
          .get();
        return {
          versions: snap.docs.map((d) => {
            const data = d.data();
            return {
              versionId: d.id,
              sys: data.sys,
              tags: data.tags || [],
              publishMessage: data.publishMessage,
            };
          }),
        };
      },
    }),

    schema_get: tool({
      description:
        'Get the field schema for a CMS collection. Returns the full field ' +
        'definitions including types, labels, and validation rules.',
      inputSchema: z.object({collectionId: z.string()}),
      execute: async ({collectionId}) => {
        const collection = await ctx.cmsClient.getCollection(collectionId);
        if (!collection) {
          return {found: false};
        }
        return {found: true, collectionId, fields: collection.fields};
      },
    }),
  };
}

function parseDocId(docId: string): {collection: string; slug: string} {
  const idx = docId.indexOf('/');
  if (idx === -1) {
    throw new Error(`invalid docId "${docId}" (expected "Collection/slug")`);
  }
  return {
    collection: docId.slice(0, idx),
    slug: docId.slice(idx + 1),
  };
}

function versionDocPath(
  projectId: string,
  collection: string,
  slug: string,
  versionId: string
): string {
  if (versionId === 'draft') {
    return `Projects/${projectId}/Collections/${collection}/Drafts/${slug}`;
  }
  if (versionId === 'published') {
    return `Projects/${projectId}/Collections/${collection}/Published/${slug}`;
  }
  return `Projects/${projectId}/Collections/${collection}/Drafts/${slug}/Versions/${versionId}`;
}
