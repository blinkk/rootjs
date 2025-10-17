import {loadRootConfig} from '@blinkk/root/node';
import packageJson from '../package.json' assert {type: 'json'};
import {RootCMSClient} from '../core/client.js';
import {
  fetchRootCmsDoc,
  rootCmsGetDocInputJsonSchema,
  rootCmsGetDocToolMetadata,
} from '../core/ai/tools/getDocTool.js';

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
    const result = await fetchRootCmsDoc(cmsClient, rawPayload);
    if (!result.doc) {
      return {
        content: [
          {
            type: 'text',
            text: `Doc not found: ${result.collectionId}/${result.slug} (mode: ${result.mode})`,
          },
        ],
        isError: true,
      };
    }
    return formatDocForResponse(result.doc);
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
      name: rootCmsGetDocToolMetadata.name,
      description: rootCmsGetDocToolMetadata.description,
      inputSchema: rootCmsGetDocInputJsonSchema,
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
