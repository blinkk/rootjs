import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {RootConfig} from '../core/config.js';

export interface McpServerOptions {
  rootConfig: RootConfig;
  version: string;
}

/**
 * Creates and returns a configured McpServer instance. Does not connect
 * the transport — the caller is responsible for that.
 */
export async function createMcpServer(
  options: McpServerOptions
): Promise<McpServer> {
  const {rootConfig} = options;
  const plugins = rootConfig.plugins || [];

  const server = new McpServer({
    name: 'root-ai',
    version: options.version,
  });

  for (const plugin of plugins) {
    if (plugin.configureMcpServer) {
      await plugin.configureMcpServer(server, {rootConfig});
    }
  }

  return server;
}

export interface McpServerHandle {
  close: () => Promise<void>;
}

/**
 * Starts the MCP server with stdio transport. This function should be
 * called when `root dev --mcp` is invoked.
 */
export async function startMcpServer(
  options: McpServerOptions
): Promise<McpServerHandle> {
  const server = await createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Root.js MCP server running on stdio');
  return {
    close: async () => {
      await server.close();
    },
  };
}
