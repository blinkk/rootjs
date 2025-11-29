import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {Timestamp} from 'firebase-admin/firestore';
import {ChatClient} from '../core/ai.js';
import {RootCMSClient, applySchemaConversions} from '../core/client.js';
import {extractFields} from '../core/extract.js';
import {schemaToZod} from '../core/zod.js';
import {generateTypes} from './generate-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMcpServer(options?: {cwd?: string}) {
  const rootDir = options?.cwd ? path.resolve(options.cwd) : process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsClient = new RootCMSClient(rootConfig);
  const projectId = cmsClient.projectId;

  // Load the project module to access schemas.
  const projectModulePath = path.resolve(__dirname, '../core/project.js');
  let projectModule: any;

  async function loadProject() {
    projectModule = (await viteSsrLoadModule(
      rootConfig,
      projectModulePath
    )) as any;
  }

  await loadProject();

  const server = new Server(
    {
      name: 'root-cms-mcp',
      version: '0.0.1',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // List Resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // TODO: Implement listing collections as resources
    return {
      resources: [
        {
          uri: `root-cms://${projectId}/collections`,
          name: 'Collections',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // Read Resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === `root-cms://${projectId}/collections`) {
      // We'll implement a proper tool for this, but resource read is also nice.
      // For now, let's focus on tools as they are more flexible for CMS operations.
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              message: 'Use tools to interact with collections',
            }),
          },
        ],
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  });

  // List Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'project_reload',
          description: 'Reload the project configuration and schemas',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'regenerate_types',
          description: 'Regenerate TypeScript definitions for the CMS',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'collections_list',
          description: 'List all collections in the CMS project',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'collections_get_schema',
          description: 'Get the schema for a specific collection',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {
                type: 'string',
                description: 'The ID of the collection',
              },
            },
            required: ['collectionId'],
          },
        },
        {
          name: 'docs_list',
          description: 'List documents in a collection',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              limit: {
                type: 'number',
                description: 'Max number of docs to return (default 10)',
              },
              offset: {type: 'number', description: 'Offset for pagination'},
              mode: {
                type: 'string',
                enum: ['draft', 'published'],
                description: 'Mode (draft or published)',
              },
            },
            required: ['collectionId'],
          },
        },
        {
          name: 'docs_get',
          description: 'Get a document by slug',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
              mode: {type: 'string', enum: ['draft', 'published']},
            },
            required: ['collectionId', 'slug'],
          },
        },
        {
          name: 'docs_save',
          description:
            'Save a draft document. For richtext fields, use EditorJS format: {"blocks": [{"type": "paragraph", "data": {"text": "..."}}]}',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
              data: {type: 'object', description: 'The document fields data'},
            },
            required: ['collectionId', 'slug', 'data'],
          },
        },
        {
          name: 'docs_publish',
          description: 'Publish a document',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
            },
            required: ['collectionId', 'slug'],
          },
        },
        {
          name: 'docs_unpublish',
          description: 'Unpublish a document',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
            },
            required: ['collectionId', 'slug'],
          },
        },
        {
          name: 'docs_delete',
          description: 'Delete a draft document',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
            },
            required: ['collectionId', 'slug'],
          },
        },
        {
          name: 'docs_lock',
          description: 'Lock a document for publishing',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
              reason: {type: 'string', description: 'Reason for locking'},
              until: {
                type: 'number',
                description: 'Timestamp (ms) until the lock expires',
              },
            },
            required: ['collectionId', 'slug', 'reason'],
          },
        },
        {
          name: 'docs_edit',
          description: 'Edit a document using AI',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
              prompt: {
                type: 'string',
                description: 'Instructions for the edit',
              },
              chatId: {
                type: 'string',
                description: 'Optional chat ID to continue a conversation',
              },
            },
            required: ['collectionId', 'slug', 'prompt'],
          },
        },
        {
          name: 'translations_create',
          description: 'Create a new translation string',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The source string to add',
              },
              tags: {
                type: 'array',
                items: {type: 'string'},
                description: 'Optional tags to add',
              },
            },
            required: ['source'],
          },
        },
        {
          name: 'translations_edit',
          description: 'Edit a translation for a specific locale',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The source string to edit',
              },
              locale: {
                type: 'string',
                description: 'The locale to edit (e.g. "es")',
              },
              translation: {
                type: 'string',
                description: 'The translated string',
              },
            },
            required: ['source', 'locale', 'translation'],
          },
        },
        {
          name: 'translations_list',
          description: 'List translations, optionally filtered by tags',
          inputSchema: {
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                items: {type: 'string'},
                description: 'Filter by tags',
              },
            },
          },
        },
        {
          name: 'translations_get',
          description: 'Get translations for a specific locale',
          inputSchema: {
            type: 'object',
            properties: {
              locale: {
                type: 'string',
                description: 'The locale (e.g. "en", "es")',
              },
              tags: {
                type: 'array',
                items: {type: 'string'},
                description: 'Filter by tags',
              },
            },
            required: ['locale'],
          },
        },
        {
          name: 'translations_save',
          description: 'Save or update translations',
          inputSchema: {
            type: 'object',
            properties: {
              translations: {
                type: 'object',
                description:
                  'Map of source strings to locale translations, e.g. {"Hello": {"es": "Hola"}}',
              },
              tags: {
                type: 'array',
                items: {type: 'string'},
                description: 'Tags to apply to the translations',
              },
            },
            required: ['translations'],
          },
        },
        {
          name: 'translations_add_tag',
          description: 'Add a tag to a translation string',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The source string to tag',
              },
              tag: {
                type: 'string',
                description: 'The tag to add (e.g. "xx/yy")',
              },
            },
            required: ['source', 'tag'],
          },
        },
        {
          name: 'translations_remove_tag',
          description: 'Remove a tag from a translation string',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'The source string to untag',
              },
              tag: {
                type: 'string',
                description: 'The tag to remove',
              },
            },
            required: ['source', 'tag'],
          },
        },
        {
          name: 'translations_extract_strings',
          description: 'Extract translatable strings from a document',
          inputSchema: {
            type: 'object',
            properties: {
              collectionId: {type: 'string'},
              slug: {type: 'string'},
            },
            required: ['collectionId', 'slug'],
          },
        },
      ],
    };
  });

  // Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const {name, arguments: args} = request.params;

    try {
      if (name === 'project_reload') {
        await loadProject();
        return {
          content: [
            {
              type: 'text',
              text: 'Project reloaded successfully',
            },
          ],
        };
      }

      if (name === 'regenerate_types') {
        await generateTypes();
        return {
          content: [
            {
              type: 'text',
              text: 'Types regenerated successfully',
            },
          ],
        };
      }

      if (name === 'collections_list') {
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

      if (name === 'collections_get_schema') {
        const collectionId = String(args?.collectionId);
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

      if (name === 'docs_list') {
        const collectionId = String(args?.collectionId);
        const limit = Number(args?.limit) || 10;
        const offset = Number(args?.offset) || 0;
        const mode = (String(args?.mode) || 'draft') as 'draft' | 'published';

        const res = await cmsClient.listDocs(collectionId, {
          mode,
          limit,
          offset,
        });
        return {
          content: [{type: 'text', text: JSON.stringify(res.docs, null, 2)}],
        };
      }

      if (name === 'docs_get') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const mode = (String(args?.mode) || 'draft') as 'draft' | 'published';

        const doc = await cmsClient.getDoc(collectionId, slug, {mode});
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

      if (name === 'docs_save') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const data = args?.data as any;
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

        const getSchema = (id: string) => {
          // Build a map of schemas by name if not already built.
          // Since we are inside the handler, we can build it once per request or cache it.
          // For simplicity, we'll iterate over SCHEMA_MODULES.
          for (const fileId in projectModule.SCHEMA_MODULES) {
            const module = projectModule.SCHEMA_MODULES[fileId];
            if (module?.default?.name === id) {
              return module.default;
            }
          }
          // Fallback to checking file ID if name doesn't match (e.g. for collections)
          const fileId = `/collections/${id}.schema.ts`;
          const module = projectModule.SCHEMA_MODULES[fileId];
          return module?.default;
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
          schema
        );
        await cmsClient.saveDraftData(docId, convertedData);
        return {
          content: [{type: 'text', text: `Saved draft for ${docId}`}],
        };
      }

      if (name === 'docs_publish') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const docId = `${collectionId}/${slug}`;

        await cmsClient.publishDocs([docId]);
        return {
          content: [{type: 'text', text: `Published ${docId}`}],
        };
      }

      if (name === 'docs_unpublish') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const docId = `${collectionId}/${slug}`;

        await cmsClient.unpublishDoc(collectionId, slug);

        return {
          content: [{type: 'text', text: `Unpublished ${docId}`}],
        };
      }

      if (name === 'docs_delete') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const docId = `${collectionId}/${slug}`;

        await cmsClient.deleteDoc(collectionId, slug);

        return {
          content: [{type: 'text', text: `Deleted ${docId}`}],
        };
      }

      if (name === 'docs_lock') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const reason = String(args?.reason);
        const until = args?.until ? Number(args?.until) : undefined;

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

      if (name === 'docs_edit') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const prompt = String(args?.prompt);
        const chatId = args?.chatId ? String(args?.chatId) : undefined;

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
          const getSchema = (id: string) => {
            for (const fileId in projectModule.SCHEMA_MODULES) {
              const module = projectModule.SCHEMA_MODULES[fileId];
              if (module?.default?.name === id) {
                return module.default;
              }
            }
            const fileId = `/collections/${id}.schema.ts`;
            const module = projectModule.SCHEMA_MODULES[fileId];
            return module?.default;
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

      if (name === 'translations_create') {
        const source = String(args?.source);
        const tags = args?.tags as string[] | undefined;
        await cmsClient.saveTranslations({[source]: {}}, tags);
        return {
          content: [{type: 'text', text: `Created translation "${source}"`}],
        };
      }

      if (name === 'translations_edit') {
        const source = String(args?.source);
        const locale = String(args?.locale);
        const translation = String(args?.translation);
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

      if (name === 'translations_list') {
        const tags = args?.tags as string[] | undefined;
        const translations = await cmsClient.loadTranslations({tags});
        return {
          content: [
            {type: 'text', text: JSON.stringify(translations, null, 2)},
          ],
        };
      }

      if (name === 'translations_get') {
        const locale = String(args?.locale);
        const tags = args?.tags as string[] | undefined;
        const translations = await cmsClient.loadTranslationsForLocale(locale, {
          tags,
        });
        return {
          content: [
            {type: 'text', text: JSON.stringify(translations, null, 2)},
          ],
        };
      }

      if (name === 'translations_save') {
        const translations = args?.translations as any;
        const tags = args?.tags as string[] | undefined;
        await cmsClient.saveTranslations(translations, tags);
        return {
          content: [{type: 'text', text: 'Translations saved.'}],
        };
      }

      if (name === 'translations_add_tag') {
        const source = String(args?.source);
        const tag = String(args?.tag);
        await cmsClient.addTranslationTag(source, tag);
        return {
          content: [{type: 'text', text: `Added tag "${tag}" to "${source}"`}],
        };
      }

      if (name === 'translations_remove_tag') {
        const source = String(args?.source);
        const tag = String(args?.tag);
        await cmsClient.removeTranslationTag(source, tag);
        return {
          content: [
            {type: 'text', text: `Removed tag "${tag}" from "${source}"`},
          ],
        };
      }

      if (name === 'translations_extract_strings') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
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

        const plugin = cmsClient.cmsPlugin as any;
        const collectionConfig = plugin.collections?.[collectionId];
        if (!collectionConfig) {
          return {
            content: [{type: 'text', text: 'Collection not found in config'}],
            isError: true,
          };
        }
        const schema = collectionConfig;

        const strings = new Set<string>();
        extractFields(
          strings,
          schema.fields || [],
          doc.fields || {},
          schema.types || {}
        );

        return {
          content: [
            {type: 'text', text: JSON.stringify(Array.from(strings), null, 2)},
          ],
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    } catch (err: any) {
      return {
        content: [{type: 'text', text: `Error: ${err.message}`}],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
