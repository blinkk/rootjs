import {loadRootConfig} from '@blinkk/root/node';
import {z} from 'zod';

import packageJson from '../package.json' assert {type: 'json'};
import {DocMode, RootCMSClient, parseDocId} from '../core/client.js';

const DOC_MODES = ['draft', 'published'] as const satisfies DocMode[];

const getDocInputSchema = z
  .object({
    docId: z
      .string()
      .describe('Fully-qualified doc id in the format "<Collection>/<slug>".')
      .optional(),
    collectionId: z
      .string()
      .describe('Collection id (e.g. "Pages").')
      .optional(),
    slug: z
      .string()
      .describe('Doc slug (e.g. "home").')
      .optional(),
    mode: z
      .enum(DOC_MODES)
      .default('draft')
      .describe('Whether to fetch the draft or published version of the doc.'),
  })
  .refine(
    (value) => {
      if (value.docId) {
        return true;
      }
      return Boolean(value.collectionId && value.slug);
    },
    {
      message:
        'Provide either "docId" or both "collectionId" and "slug" for the doc to fetch.',
      path: ['docId'],
    }
  );

const getDocInputJsonSchema = {
  type: 'object',
  properties: {
    docId: {
      type: 'string',
      description:
        'Fully-qualified doc id in the format "<Collection>/<slug>" (e.g. "Pages/home").',
    },
    collectionId: {
      type: 'string',
      description: 'Collection id (e.g. "Pages").',
    },
    slug: {
      type: 'string',
      description: 'Doc slug (e.g. "home").',
    },
    mode: {
      type: 'string',
      enum: [...DOC_MODES],
      description: 'Whether to fetch the draft or published version of the doc.',
      default: 'draft',
    },
  },
  oneOf: [
    {
      required: ['docId'],
    },
    {
      required: ['collectionId', 'slug'],
    },
  ],
  additionalProperties: false,
} as const;

type ToolResponse = {
  content: Array<{type: 'text'; text: string}>;
  isError?: boolean;
};

async function loadMcpSdk() {
  const [{Server}, transportModule] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/index.js'),
    import('@modelcontextprotocol/sdk/server/node/index.js').catch(async () =>
      import('@modelcontextprotocol/sdk/server/stdio.js')
    ),
  ]);
  const StdioServerTransport =
    (transportModule as any).StdioServerTransport ||
    (transportModule as any).stdioServerTransport ||
    (transportModule as any).default;
  if (!StdioServerTransport) {
    throw new Error('Unable to load MCP stdio transport implementation.');
  }
  return {Server, StdioServerTransport};
}

function registerTool(
  server: any,
  definition: {
    name: string;
    description: string;
    inputSchema: unknown;
  },
  handler: (payload: unknown) => Promise<ToolResponse>
) {
  if (typeof server.tool === 'function') {
    return server.tool(definition, handler);
  }
  if (typeof server.registerTool === 'function') {
    return server.registerTool(definition, handler);
  }
  if (typeof server.addTool === 'function') {
    return server.addTool(definition, handler);
  }
  throw new Error('Unsupported MCP SDK version: missing tool registration helper.');
}

function formatDocForResponse(doc: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(doc, null, 2),
      },
    ],
  };
}

async function handleGetDocRequest(
  cmsClient: RootCMSClient,
  rawPayload: unknown
): Promise<ToolResponse> {
  try {
    const parsed = getDocInputSchema.parse(rawPayload);
    let collectionId = parsed.collectionId;
    let slug = parsed.slug;
    if (parsed.docId) {
      const docInfo = parseDocId(parsed.docId);
      collectionId = docInfo.collection;
      slug = docInfo.slug;
    }
    if (!collectionId || !slug) {
      throw new Error(
        'A collection id and slug are required to fetch a doc from Root CMS.'
      );
    }
    const mode: DocMode = parsed.mode || 'draft';
    const doc = await cmsClient.getDoc(collectionId, slug, {mode});
    if (!doc) {
      return {
        content: [
          {
            type: 'text',
            text: `Doc not found: ${collectionId}/${slug} (mode: ${mode})`,
          },
        ],
        isError: true,
      };
    }
    return formatDocForResponse(doc);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error fetching doc.';
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching Root CMS doc: ${message}`,
        },
      ],
      isError: true,
    };
  }
}

export async function startMcpServer() {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsClient = new RootCMSClient(rootConfig);

  const {Server, StdioServerTransport} = await loadMcpSdk();
  const server = new Server({
    name: 'root-cms-mcp',
    version: packageJson.version,
    description: 'Expose Root CMS project data over the Model Context Protocol.',
  });

  registerTool(
    server,
    {
      name: 'root_cms.get_doc',
      description:
        'Fetch a document from the current Root CMS project by collection and slug.',
      inputSchema: getDocInputJsonSchema,
    },
    async (payload: unknown) => {
      const input =
        (payload as any)?.input ??
        (payload as any)?.arguments ??
        payload;
      return handleGetDocRequest(cmsClient, input);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Root CMS MCP server listening on stdio. Press Ctrl+C to exit.');

  await new Promise<void>((resolve, reject) => {
    const shutdown = () => {
      try {
        if (typeof transport.close === 'function') {
          transport.close();
        }
      } catch (err) {
        reject(err);
        return;
      }
      resolve();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
