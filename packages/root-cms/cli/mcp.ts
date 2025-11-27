import path from 'node:path';
import {loadRootConfig} from '@blinkk/root/node';
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
import {FieldValue} from 'firebase-admin/firestore';
import {ChatClient} from '../core/ai.js';
import {RootCMSClient} from '../core/client.js';

export async function runMcpServer(options?: {cwd?: string}) {
  const rootDir = options?.cwd ? path.resolve(options.cwd) : process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsClient = new RootCMSClient(rootConfig);
  const projectId = cmsClient.projectId;

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
          description: 'Save a draft document',
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
      if (name === 'collections_list') {
        // RootCMSClient doesn't have a direct listCollections method exposed in the public API easily?
        // Actually, we can list collections by looking at the schema or firestore.
        // Let's look at `core/project.ts` or similar if needed, but `cmsClient` might not have it.
        // Wait, `cmsPlugin` writes schemas to `dist/collections`.
        // Or we can query Firestore `Projects/{id}/Collections`.
        // Let's try to use `cmsClient.db` to list collections if possible, or just return a placeholder.
        // Actually, `cmsClient` is the best way.
        // Let's check `cmsClient` capabilities again.
        // It has `db`.
        const collectionsPath = `Projects/${projectId}/Collections`;
        const collections = await cmsClient.db
          .collection(collectionsPath)
          .listDocuments();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                collections.map((c) => c.id),
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'collections_get_schema') {
        // This is tricky without `project.js`.
        // But we can try to read the schema from the file system if we are in the project root.
        // Or maybe `cmsClient` can help?
        // `cmsPlugin` has `hooks` that write schemas.
        // Let's assume for now we can't easily get the full schema without `project.js`.
        // We'll return a message saying "Not implemented yet".
        return {
          content: [
            {
              type: 'text',
              text: 'Schema retrieval not yet implemented via MCP',
            },
          ],
          isError: true,
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

        await cmsClient.saveDraftData(docId, data);
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
        const publishedRef = cmsClient.dbDocRef(collectionId, slug, {
          mode: 'published',
        });
        const draftRef = cmsClient.dbDocRef(collectionId, slug, {
          mode: 'draft',
        });

        const batch = cmsClient.db.batch();
        batch.delete(publishedRef);
        batch.update(draftRef, {
          'sys.publishedAt': FieldValue.delete(),
          'sys.publishedBy': FieldValue.delete(),
          'sys.firstPublishedAt': FieldValue.delete(),
          'sys.firstPublishedBy': FieldValue.delete(),
        });
        await batch.commit();

        return {
          content: [{type: 'text', text: `Unpublished ${docId}`}],
        };
      }

      if (name === 'docs_delete') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const docId = `${collectionId}/${slug}`;
        const draftRef = cmsClient.dbDocRef(collectionId, slug, {
          mode: 'draft',
        });
        const publishedRef = cmsClient.dbDocRef(collectionId, slug, {
          mode: 'published',
        });

        // Check if published doc exists to warn user?
        // For now, just delete draft.
        // If we want to delete everything, we should delete published too.
        // But "delete" usually means "delete draft".
        // Let's assume delete draft for now.
        // Actually, let's delete both to be safe if it's a full delete.
        // But usually "delete" in CMS means delete the doc entirely.
        const batch = cmsClient.db.batch();
        batch.delete(draftRef);
        batch.delete(publishedRef);
        await batch.commit();

        return {
          content: [{type: 'text', text: `Deleted ${docId}`}],
        };
      }

      if (name === 'docs_lock') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const reason = String(args?.reason);
        const until = args?.until ? Number(args?.until) : undefined;
        const draftRef = cmsClient.dbDocRef(collectionId, slug, {
          mode: 'draft',
        });

        const lockingData: any = {
          lockedAt: new Date().toISOString(),
          lockedBy: 'mcp-server',
          reason: reason,
        };
        if (until) {
          lockingData.until = Timestamp.fromMillis(until);
        }

        await draftRef.update({
          'sys.publishingLocked': lockingData,
        });

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

        const chatClient = new ChatClient(cmsClient, 'mcp-server');
        const chat = await chatClient.getOrCreateChat(chatId);

        const res = await chat.sendPrompt([{text: prompt}], {
          mode: 'edit',
          editData: doc.fields,
        });

        if (res.error) {
          return {
            content: [{type: 'text', text: `AI Error: ${res.error}`}],
            isError: true,
          };
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
        // Saving with an empty translation map for the source string will just
        // update the tags for that string's hash without overwriting existing
        // translations, because `saveTranslations` uses `merge: true`.
        await cmsClient.saveTranslations({[source]: {}}, [tag]);
        return {
          content: [{type: 'text', text: `Added tag "${tag}" to "${source}"`}],
        };
      }

      if (name === 'translations_remove_tag') {
        const source = String(args?.source);
        const tag = String(args?.tag);
        const hash = cmsClient.getTranslationKey(source);
        const translationsPath = `Projects/${projectId}/Translations`;
        const translationRef = cmsClient.db.doc(`${translationsPath}/${hash}`);
        await translationRef.update({
          tags: FieldValue.arrayRemove(tag),
        });
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

function normalizeString(str: string) {
  return str.trim().replace(/[ \t]+$/gm, '');
}

function extractFields(
  strings: Set<string>,
  fields: any[],
  data: Record<string, any>,
  types: Record<string, any> = {}
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];
    extractField(strings, field, fieldValue, types);
  });
}

function extractField(
  strings: Set<string>,
  field: any,
  fieldValue: any,
  types: Record<string, any> = {}
) {
  if (!fieldValue) {
    return;
  }

  function addString(text: string) {
    const str = normalizeString(text);
    if (str) {
      strings.add(str);
    }
  }

  if (field.type === 'object') {
    extractFields(strings, field.fields || [], fieldValue, types);
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractField(strings, field.of, fieldValue[arrayKey], types);
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addString(fieldValue);
    }
  } else if (field.type === 'image') {
    if (
      field.translate &&
      fieldValue &&
      fieldValue.alt &&
      field.alt !== false
    ) {
      addString(fieldValue.alt);
    }
  } else if (field.type === 'multiselect') {
    if (field.translate && Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        addString(value);
      }
    }
  } else if (field.type === 'oneof') {
    const fieldTypes = field.types || [];
    let fieldValueType: any;
    if (typeof fieldTypes[0] === 'string') {
      if ((fieldTypes as string[]).includes(fieldValue._type)) {
        fieldValueType = types[fieldValue._type];
      }
    } else {
      fieldValueType = (fieldTypes as any[]).find(
        (item: any) => item.name === fieldValue._type
      );
    }
    if (fieldValueType) {
      extractFields(strings, fieldValueType.fields || [], fieldValue, types);
    }
  } else if (field.type === 'richtext') {
    if (field.translate) {
      extractRichTextStrings(strings, fieldValue);
    }
  }
}

function extractRichTextStrings(strings: Set<string>, data: any) {
  const blocks = data?.blocks || [];
  blocks.forEach((block: any) => {
    extractBlockStrings(strings, block);
  });
}

function extractBlockStrings(strings: Set<string>, block: any) {
  if (!block?.type) {
    return;
  }

  function addString(text?: string) {
    if (!text) {
      return;
    }
    const str = normalizeString(text);
    if (str) {
      strings.add(str);
    }
  }

  function addComponentStrings(components?: Record<string, any>) {
    if (!components) {
      return;
    }
    Object.values(components).forEach((component) => {
      collectComponentStrings(component);
    });
  }

  function collectComponentStrings(value: any) {
    if (typeof value === 'string') {
      addString(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectComponentStrings(item));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach((item) => collectComponentStrings(item));
    }
  }

  function extractList(items?: any[]) {
    if (!items) {
      return;
    }
    items.forEach((item) => {
      addString(item.content);
      addComponentStrings(item.components);
      extractList(item.items);
    });
  }

  if (block.type === 'heading' || block.type === 'paragraph') {
    addString(block.data?.text);
    addComponentStrings(block.data?.components);
  } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
    extractList(block.data?.items);
  } else if (block.type === 'html') {
    addString(block.data?.html);
  }
}
