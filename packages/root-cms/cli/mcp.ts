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
          name: 'list_collections',
          description: 'List all collections in the CMS project',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_collection_schema',
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
          name: 'list_docs',
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
          name: 'get_doc',
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
          name: 'save_doc',
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
          name: 'publish_doc',
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
          name: 'edit_doc',
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
      ],
    };
  });

  // Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const {name, arguments: args} = request.params;

    try {
      if (name === 'list_collections') {
        // RootCMSClient doesn't have a direct listCollections method exposed in the public API easily?
        // Actually, we can list collections by looking at the schema or firestore.
        // Let's look at `core/project.ts` or similar if needed, but `cmsClient` might not have it.
        // Wait, `cmsPlugin` writes schemas to `dist/collections`.
        // Or we can query Firestore `Projects/{id}/Collections`.
        // Let's try to use `cmsClient.db` to list collections if possible, or better, use the project config.
        // `RootCMSClient` has `rootConfig`.
        // Let's use `project.getProjectSchemas()` if we can access it.
        // But `project.js` is a server-side module.
        // For now, let's try to list from Firestore if possible, or just return a placeholder.
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

      if (name === 'get_collection_schema') {
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

      if (name === 'list_docs') {
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

      if (name === 'get_doc') {
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

      if (name === 'save_doc') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const data = args?.data as any;
        const docId = `${collectionId}/${slug}`;

        await cmsClient.saveDraftData(docId, data);
        return {
          content: [{type: 'text', text: `Saved draft for ${docId}`}],
        };
      }

      if (name === 'publish_doc') {
        const collectionId = String(args?.collectionId);
        const slug = String(args?.slug);
        const docId = `${collectionId}/${slug}`;

        await cmsClient.publishDocs([docId]);
        return {
          content: [{type: 'text', text: `Published ${docId}`}],
        };
      }

      if (name === 'edit_doc') {
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
