/**
 * Built-in tools exposed to the chat model. Each tool is a thin wrapper around
 * `RootCMSClient` so the model can read and write CMS docs from the
 * `/cms/ai` page.
 */
import {RootConfig} from '@blinkk/root';
import {tool, ToolSet} from 'ai';
import {z} from 'zod';
import {parseDocId, RootCMSClient} from './client.js';

export interface CmsToolsOptions {
  cmsClient: RootCMSClient;
  rootConfig: RootConfig;
}

/** Returns the tool set passed to `streamText`. */
export function createCmsTools(options: CmsToolsOptions): ToolSet {
  const {cmsClient} = options;

  return {
    listCollections: tool({
      description:
        'List all CMS collections defined in the project. Returns each ' +
        'collection id along with optional name/description metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        const project = await import('./project.js');
        const collections: Array<{
          id: string;
          name?: string;
          description?: string;
        }> = [];
        for (const fileId in project.SCHEMA_MODULES) {
          if (!fileId.startsWith('/collections/')) {
            continue;
          }
          const id = fileId
            .replace('/collections/', '')
            .replace('.schema.ts', '');
          const schema = project.getCollectionSchema(id);
          if (schema) {
            collections.push({
              id,
              name: schema.name,
              description: schema.description,
            });
          }
        }
        return {collections};
      },
    }),

    listDocs: tool({
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
      execute: async ({collectionId, mode, limit}) => {
        const result = await cmsClient.listDocs<any>(collectionId, {
          mode,
          limit,
        });
        return {
          docs: result.docs.map((doc: any) => ({
            id: doc.id,
            slug: doc.slug,
            sys: doc.sys,
          })),
        };
      },
    }),

    getDoc: tool({
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
      execute: async ({docId, mode}) => {
        const {collection, slug} = parseDocId(docId);
        const doc = await cmsClient.getDoc(collection, slug, {mode});
        if (!doc) {
          return {found: false};
        }
        return {found: true, doc};
      },
    }),

    updateDocField: tool({
      description:
        'Update a single field on a draft CMS document by JSON path. ' +
        'Use dotted paths (e.g. "hero.title") and array indices (e.g. ' +
        '"sections.0.heading"). Only updates the draft version; users must ' +
        'publish separately. Always confirm with the user before calling.',
      inputSchema: z.object({
        docId: z.string(),
        path: z.string().describe('Dotted JSON path within the fields object.'),
        value: z.any().describe('JSON value to set at the path.'),
      }),
      execute: async ({docId, path, value}) => {
        await cmsClient.updateDraftData(docId, path, value);
        return {success: true, docId, path};
      },
    }),

    searchDocs: tool({
      description:
        'Run a full-text search across all indexed CMS docs. Returns the ' +
        'top matching doc ids ordered by relevance.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({query, limit}) => {
        const {SearchIndexService} = await import('./search-index.js');
        const service = new SearchIndexService(options.rootConfig);
        const result = await service.search(query, {limit});
        return result;
      },
    }),
  };
}
