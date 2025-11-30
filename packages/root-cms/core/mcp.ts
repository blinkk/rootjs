import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {z} from 'zod';
import {ChatClient} from './ai.js';
import {RootCMSClient, applySchemaConversions} from './client.js';
import {extractFields} from './extract.js';
import {Schema} from './schema.js';
import {schemaToZod} from './zod.js';

export interface McpServerOptions {
  name: string;
  version: string;
  cmsClient: RootCMSClient;
  projectModule: any;
  /**
   * Optional callback to reload the project.
   */
  loadProject?: () => Promise<void>;
  /**
   * Optional callback to regenerate types.
   */
  generateTypes?: () => Promise<void>;
}

export async function createMcpServer(options: McpServerOptions) {
  const {cmsClient, projectModule} = options;

  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  const projectId = cmsClient.projectId;

  // Register Resources
  // Collections as resources
  const collections = await cmsClient.listCollections();
  for (const collectionId of collections) {
    server.resource(
      `Collection: ${collectionId}`,
      `root-cms://${projectId}/collections/${collectionId}`,
      {
        description: `Schema for ${collectionId} collection`,
        mimeType: 'application/json',
      },
      async () => {
        const schema = await projectModule.getCollectionSchema(collectionId);
        if (!schema) {
          throw new Error(`Collection schema not found: ${collectionId}`);
        }
        return {
          contents: [
            {
              uri: `root-cms://${projectId}/collections/${collectionId}`,
              mimeType: 'application/json',
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      }
    );
  }

  // Translations resource
  server.resource(
    'Translations',
    `root-cms://${projectId}/translations`,
    {
      description: 'All translation strings',
      mimeType: 'application/json',
    },
    async () => {
      const translations = await cmsClient.loadTranslations({});
      return {
        contents: [
          {
            uri: `root-cms://${projectId}/translations`,
            mimeType: 'application/json',
            text: JSON.stringify(translations, null, 2),
          },
        ],
      };
    }
  );

  // Releases resource
  server.resource(
    'Releases',
    `root-cms://${projectId}/releases`,
    {
      description: 'All releases',
      mimeType: 'application/json',
    },
    async () => {
      const releases = await cmsClient.listReleases();
      return {
        contents: [
          {
            uri: `root-cms://${projectId}/releases`,
            mimeType: 'application/json',
            text: JSON.stringify(releases, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'project_reload',
    {
      description:
        'Reload the project configuration and schemas. Use this whenever the module library changes.',
      inputSchema: {},
    },
    async () => {
      if (options.loadProject) {
        await options.loadProject();
        return {
          content: [
            {
              type: 'text',
              text: 'Project reloaded successfully',
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: 'Project reload not supported in this environment',
          },
        ],
      };
    }
  );

  server.registerTool(
    'regenerate_types',
    {
      description:
        'Regenerate TypeScript definitions for the CMS. Use this whenever the module library changes.',
      inputSchema: {},
    },
    async () => {
      if (options.generateTypes) {
        await options.generateTypes();
        return {
          content: [
            {
              type: 'text',
              text: 'Types regenerated successfully',
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: 'Type generation not supported in this environment',
          },
        ],
      };
    }
  );
  server.registerTool(
    'collections_list',
    {
      description: 'List all collections in the CMS project.',
      inputSchema: {},
    },
    async () => {
      const collections = await cmsClient.listCollections();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(collections, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'collections_get_schema',
    {
      description: 'Get the schema for a specific collection',
      inputSchema: {
        collectionId: z.string().describe('The ID of the collection'),
      },
    },
    async ({collectionId}) => {
      const schema = await projectModule.getCollectionSchema(collectionId);
      if (!schema) {
        return {
          content: [
            {
              type: 'text',
              text: `No schema found for collection: ${collectionId}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'docs_list',
    {
      description: 'List documents in a collection',
      inputSchema: {
        collectionId: z.string(),
        limit: z
          .number()
          .optional()
          .describe('Max number of docs to return (default 10)'),
        offset: z.number().optional().describe('Offset for pagination'),
        mode: z
          .enum(['draft', 'published'])
          .optional()
          .describe('Mode (draft or published)'),
      },
    },
    async ({collectionId, limit, offset, mode}) => {
      const res = await cmsClient.listDocs(collectionId, {
        mode: mode || 'draft',
        limit: limit || 10,
        offset: offset || 0,
      });
      return {
        content: [{type: 'text', text: JSON.stringify(res.docs, null, 2)}],
      };
    }
  );

  server.registerTool(
    'docs_get',
    {
      description: 'Get a document by slug',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
        mode: z.enum(['draft', 'published']).optional(),
      },
    },
    async ({collectionId, slug, mode}) => {
      const doc = await cmsClient.getDoc(collectionId, slug, {
        mode: mode || 'draft',
      });
      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Document not found: ${collectionId}/${slug}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{type: 'text', text: JSON.stringify(doc, null, 2)}],
      };
    }
  );
  server.registerTool(
    'docs_save',
    {
      description:
        'Save a draft document. For richtext fields, use EditorJS format: {"blocks": [{"type": "paragraph", "data": {"text": "..."}}]}',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
        data: z.record(z.any()).describe('The document fields data'),
      },
    },
    async ({collectionId, slug, data}) => {
      const docId = `${collectionId}/${slug}`;

      // Validate against schema
      const schema = await projectModule.getCollectionSchema(collectionId);
      if (!schema) {
        return {
          content: [
            {
              type: 'text',
              text: `No schema found for collection: ${collectionId}`,
            },
          ],
          isError: true,
        };
      }

      // Cache schema lookups to avoid duplicates in discriminated unions
      const schemaCache = new Map<string, Schema>();
      const getSchema = (id: string) => {
        if (schemaCache.has(id)) {
          return schemaCache.get(id);
        }

        let schema: Schema | undefined;
        // Build a map of schemas by name if not already built.
        // Since we are inside the handler, we can build it once per request or cache it.
        // For simplicity, we'll iterate over SCHEMA_MODULES.
        for (const fileId in projectModule.SCHEMA_MODULES) {
          const module = projectModule.SCHEMA_MODULES[fileId];
          if (module?.default?.name === id) {
            schema = module.default;
            break;
          }
        }
        // Fallback to checking file ID if name doesn't match (e.g. for collections)
        if (!schema) {
          const fileId = `/collections/${id}.schema.ts`;
          const module = projectModule.SCHEMA_MODULES[fileId];
          schema = module?.default;
        }

        if (schema) {
          schemaCache.set(id, schema);
        }
        return schema;
      };

      const zodSchema = schemaToZod(schema, getSchema);
      const validationResult = zodSchema.safeParse(data);
      if (!validationResult.success) {
        let errors = validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('\n');

        // Add hint for richtext errors
        if (
          errors.includes('richtext') ||
          errors.includes('Expected object') ||
          errors.includes('blocks')
        ) {
          errors +=
            '\n\nHINT: Richtext fields must use EditorJS format: {"blocks": [{"type": "paragraph", "data": {"text": "..."}}]}';
        }

        return {
          content: [
            {
              type: 'text',
              text: `Validation failed for ${docId}:\n${errors}`,
            },
          ],
          isError: true,
        };
      }

      const convertedData = applySchemaConversions(
        validationResult.data,
        schema,
        getSchema
      );
      await cmsClient.saveDraftData(docId, convertedData);
      return {
        content: [{type: 'text', text: `Saved draft for ${docId}`}],
      };
    }
  );

  server.registerTool(
    'docs_publish',
    {
      description: 'Publish a document',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
      },
    },
    async ({collectionId, slug}) => {
      const docId = `${collectionId}/${slug}`;
      await cmsClient.publishDocs([docId]);
      return {
        content: [{type: 'text', text: `Published ${docId}`}],
      };
    }
  );

  server.registerTool(
    'docs_unpublish',
    {
      description: 'Unpublish a document',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
      },
    },
    async ({collectionId, slug}) => {
      const docId = `${collectionId}/${slug}`;
      await cmsClient.unpublishDoc(collectionId, slug);
      return {
        content: [{type: 'text', text: `Unpublished ${docId}`}],
      };
    }
  );

  server.registerTool(
    'docs_delete',
    {
      description: 'Delete a draft document',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
      },
    },
    async ({collectionId, slug}) => {
      const docId = `${collectionId}/${slug}`;
      await cmsClient.deleteDoc(collectionId, slug);
      return {
        content: [{type: 'text', text: `Deleted ${docId}`}],
      };
    }
  );

  server.registerTool(
    'docs_lock',
    {
      description: 'Lock a document for publishing',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
        reason: z.string().describe('Reason for locking'),
        until: z
          .number()
          .optional()
          .describe('Timestamp (ms) until the lock expires'),
      },
    },
    async ({collectionId, slug, reason, until}) => {
      await cmsClient.lockDoc(
        collectionId,
        slug,
        reason,
        until ? Timestamp.fromMillis(until) : undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: `Locked ${collectionId}/${slug} for publishing`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'docs_edit',
    {
      description: 'Edit a document using AI',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
        prompt: z.string().describe('Instructions for the edit'),
        chatId: z
          .string()
          .optional()
          .describe('Optional chat ID to continue a conversation'),
      },
    },
    async ({collectionId, slug, prompt, chatId}) => {
      const doc = await cmsClient.getDoc(collectionId, slug, {mode: 'draft'});
      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Document not found: ${collectionId}/${slug}`,
            },
          ],
          isError: true,
        };
      }

      const schema = await projectModule.getCollectionSchema(collectionId);
      if (!schema) {
        return {
          content: [
            {
              type: 'text',
              text: `No schema found for collection: ${collectionId}`,
            },
          ],
          isError: true,
        };
      }

      const systemPrompt = `
You are editing a document in the Root CMS.
The document follows this schema:
${JSON.stringify(schema, null, 2)}

IMPORTANT:
- Output valid JSON matching the schema.
- For 'oneof' fields, use the '_type' property to specify the type.
- Do NOT use 'type' for the type discriminator, use '_type'.
- Arrays should be JSON arrays, not objects with '_array' keys.
- For 'richtext' fields, use the EditorJS format: {"blocks": [{"type": "paragraph", "data": {"text": "..."}}, ...]}.
`;

      const chatClient = new ChatClient(cmsClient, 'mcp-server');
      const chat = await chatClient.getOrCreateChat(chatId);

      const res = await chat.sendPrompt(
        [
          {text: systemPrompt},
          {
            text: `Current document state:\n${JSON.stringify(
              doc.fields,
              null,
              2
            )}`,
          },
          {text: prompt},
        ],
        {
          mode: 'edit',
          editData: doc.fields,
        }
      );

      if (res.error) {
        return {
          content: [{type: 'text', text: `AI Error: ${res.error}`}],
          isError: true,
        };
      }

      // Validate the AI output against the schema
      if (schema) {
        // Cache schema lookups to avoid duplicates in discriminated unions
        const schemaCache = new Map<string, Schema>();
        const getSchema = (id: string) => {
          if (schemaCache.has(id)) {
            return schemaCache.get(id);
          }

          let schema: Schema | undefined;
          for (const fileId in projectModule.SCHEMA_MODULES) {
            const module = projectModule.SCHEMA_MODULES[fileId];
            if (module?.default?.name === id) {
              schema = module.default;
              break;
            }
          }
          if (!schema) {
            const fileId = `/collections/${id}.schema.ts`;
            const module = projectModule.SCHEMA_MODULES[fileId];
            schema = module?.default;
          }

          if (schema) {
            schemaCache.set(id, schema);
          }
          return schema;
        };

        const zodSchema = schemaToZod(schema, getSchema);
        const validationResult = zodSchema.safeParse(res.data);
        if (!validationResult.success) {
          const errors = validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `AI generated invalid data:\n${errors}\n\nGenerated data:\n${JSON.stringify(
                  res.data,
                  null,
                  2
                )}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {type: 'text', text: res.message || 'Edit complete.'},
          {type: 'text', text: JSON.stringify(res.data, null, 2)},
        ],
      };
    }
  );
  server.registerTool(
    'translations_create',
    {
      description: 'Create a new translation string',
      inputSchema: {
        source: z.string().describe('The source string to add'),
        tags: z.array(z.string()).optional().describe('Optional tags to add'),
      },
    },
    async ({source, tags}) => {
      await cmsClient.saveTranslations({[source]: {}}, tags);
      return {
        content: [{type: 'text', text: `Created translation "${source}"`}],
      };
    }
  );

  server.registerTool(
    'translations_edit',
    {
      description: 'Edit a translation for a specific locale',
      inputSchema: {
        source: z.string().describe('The source string to edit'),
        locale: z.string().describe('The locale to edit (e.g. "es")'),
        translation: z.string().describe('The translated string'),
      },
    },
    async ({source, locale, translation}) => {
      await cmsClient.saveTranslations({[source]: {[locale]: translation}});
      return {
        content: [
          {
            type: 'text',
            text: `Updated translation for "${source}" (${locale})`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'translations_list',
    {
      description: 'List translations, optionally filtered by tags',
      inputSchema: {
        tags: z.array(z.string()).optional().describe('Filter by tags'),
      },
    },
    async ({tags}) => {
      const translations = await cmsClient.loadTranslations({tags});
      return {
        content: [{type: 'text', text: JSON.stringify(translations, null, 2)}],
      };
    }
  );

  server.registerTool(
    'translations_get',
    {
      description: 'Get translations for a specific locale',
      inputSchema: {
        locale: z.string().describe('The locale (e.g. "en", "es")'),
        tags: z.array(z.string()).optional().describe('Filter by tags'),
      },
    },
    async ({locale, tags}) => {
      const translations = await cmsClient.loadTranslationsForLocale(locale, {
        tags,
      });
      return {
        content: [{type: 'text', text: JSON.stringify(translations, null, 2)}],
      };
    }
  );

  server.registerTool(
    'translations_save',
    {
      description: 'Save or update translations',
      inputSchema: {
        translations: z
          .record(z.record(z.string()))
          .describe(
            'Map of source strings to locale translations, e.g. {"Hello": {"es": "Hola"}}'
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe('Tags to apply to the translations'),
      },
    },
    async ({translations, tags}) => {
      await cmsClient.saveTranslations(translations, tags);
      return {
        content: [{type: 'text', text: 'Translations saved.'}],
      };
    }
  );

  server.registerTool(
    'translations_add_tag',
    {
      description: 'Add a tag to a translation string',
      inputSchema: {
        source: z.string().describe('The source string to tag'),
        tag: z.string().describe('The tag to add (e.g. "xx/yy")'),
      },
    },
    async ({source, tag}) => {
      await cmsClient.addTranslationTag(source, tag);
      return {
        content: [{type: 'text', text: `Added tag "${tag}" to "${source}"`}],
      };
    }
  );

  server.registerTool(
    'translations_remove_tag',
    {
      description: 'Remove a tag from a translation string',
      inputSchema: {
        source: z.string().describe('The source string to untag'),
        tag: z.string().describe('The tag to remove'),
      },
    },
    async ({source, tag}) => {
      await cmsClient.removeTranslationTag(source, tag);
      return {
        content: [
          {type: 'text', text: `Removed tag "${tag}" from "${source}"`},
        ],
      };
    }
  );

  server.registerTool(
    'translations_extract_strings',
    {
      description: 'Extract translatable strings from a document',
      inputSchema: {
        collectionId: z.string(),
        slug: z.string(),
      },
    },
    async ({collectionId, slug}) => {
      const doc = await cmsClient.getDoc(collectionId, slug, {mode: 'draft'});
      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Document not found: ${collectionId}/${slug}`,
            },
          ],
          isError: true,
        };
      }

      const schema = await projectModule.getCollectionSchema(collectionId);
      if (!schema) {
        return {
          content: [
            {
              type: 'text',
              text: `No schema found for collection: ${collectionId}`,
            },
          ],
          isError: true,
        };
      }

      const strings = new Set<string>();
      extractFields(strings, schema.fields, doc.fields);
      const translations: Record<string, Record<string, string>> = {};
      for (const str of strings) {
        translations[str] = {};
      }

      if (Object.keys(translations).length > 0) {
        await cmsClient.saveTranslations(translations);
        return {
          content: [
            {
              type: 'text',
              text: `Extracted ${
                Object.keys(translations).length
              } strings from ${collectionId}/${slug}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `No translatable strings found in ${collectionId}/${slug}`,
          },
        ],
      };
    }
  );
  server.registerTool(
    'docs_unlock',
    {
      description: 'Unlock publishing for a document',
      inputSchema: {
        id: z
          .string()
          .describe('The ID of the document to unlock (e.g. "Pages/foo")'),
      },
    },
    async ({id}) => {
      const [collectionId, slug] = id.split('/');
      const docRef = cmsClient.dbDocRef(collectionId, slug, {mode: 'draft'});
      await docRef.update({
        'sys.publishingLocked': FieldValue.delete(),
      });
      return {
        content: [{type: 'text', text: `Unlocked document ${id}`}],
      };
    }
  );
  server.registerTool(
    'releases_list',
    {
      description: 'List all releases',
      inputSchema: {},
    },
    async () => {
      const releases = await cmsClient.listReleases();
      return {
        content: [{type: 'text', text: JSON.stringify(releases, null, 2)}],
      };
    }
  );

  server.registerTool(
    'releases_get',
    {
      description: 'Get a release by ID',
      inputSchema: {
        id: z.string().describe('The release ID'),
      },
    },
    async ({id}) => {
      const release = await cmsClient.getRelease(id);
      if (!release) {
        return {
          content: [{type: 'text', text: `Release not found: ${id}`}],
          isError: true,
        };
      }
      return {
        content: [{type: 'text', text: JSON.stringify(release, null, 2)}],
      };
    }
  );

  server.registerTool(
    'releases_create',
    {
      description: 'Create a new release',
      inputSchema: {
        id: z.string().describe('The release ID'),
        description: z.string().optional().describe('Release description'),
        docIds: z
          .array(z.string())
          .optional()
          .describe('List of doc IDs to include'),
        dataSourceIds: z
          .array(z.string())
          .optional()
          .describe('List of data source IDs to include'),
      },
    },
    async ({id, description, docIds, dataSourceIds}) => {
      const release = {
        description,
        docIds,
        dataSourceIds,
      };
      await cmsClient.createRelease(id, release);
      return {
        content: [{type: 'text', text: `Created release ${id}`}],
      };
    }
  );

  server.registerTool(
    'releases_edit',
    {
      description: 'Edit an existing release',
      inputSchema: {
        id: z.string().describe('The release ID'),
        description: z.string().optional().describe('Release description'),
        docIds: z
          .array(z.string())
          .optional()
          .describe('List of doc IDs to include'),
        dataSourceIds: z
          .array(z.string())
          .optional()
          .describe('List of data source IDs to include'),
      },
    },
    async ({id, description, docIds, dataSourceIds}) => {
      const release: any = {};
      if (description) release.description = description;
      if (docIds) release.docIds = docIds;
      if (dataSourceIds) release.dataSourceIds = dataSourceIds;

      await cmsClient.updateRelease(id, release);
      return {
        content: [{type: 'text', text: `Updated release ${id}`}],
      };
    }
  );

  server.registerTool(
    'releases_delete',
    {
      description: 'Delete a release',
      inputSchema: {
        id: z.string().describe('The release ID'),
      },
    },
    async ({id}) => {
      await cmsClient.deleteRelease(id);
      return {
        content: [{type: 'text', text: `Deleted release ${id}`}],
      };
    }
  );

  server.registerTool(
    'releases_publish',
    {
      description: 'Publish a release immediately',
      inputSchema: {
        id: z.string().describe('The release ID'),
      },
    },
    async ({id}) => {
      await cmsClient.publishRelease(id);
      return {
        content: [{type: 'text', text: `Published release ${id}`}],
      };
    }
  );

  server.registerTool(
    'releases_schedule',
    {
      description: 'Schedule a release for future publishing',
      inputSchema: {
        id: z.string().describe('The release ID'),
        timestamp: z.number().describe('Timestamp (ms) when to publish'),
      },
    },
    async ({id, timestamp}) => {
      await cmsClient.scheduleRelease(id, timestamp);
      return {
        content: [
          {
            type: 'text',
            text: `Scheduled release ${id} for ${new Date(
              timestamp
            ).toISOString()}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'releases_unschedule',
    {
      description: 'Cancel a scheduled release',
      inputSchema: {
        id: z.string().describe('The release ID'),
      },
    },
    async ({id}) => {
      await cmsClient.unscheduleRelease(id);
      return {
        content: [{type: 'text', text: `Unscheduled release ${id}`}],
      };
    }
  );

  return server;
}
