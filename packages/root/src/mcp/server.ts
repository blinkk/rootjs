import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {RootConfig} from '../core/config.js';

export function createMcpServer(rootConfig: RootConfig) {
  const mcpServer = new McpServer({
    name: 'root-mcp',
    version: '2.5.1',
  });

  // Example tool.
  mcpServer.tool('echo', {message: z.string()}, async ({message}) => {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${message}`,
        },
      ],
    };
  });

  // Register plugin tools.
  const plugins = rootConfig.plugins || [];
  plugins.forEach((plugin) => {
    if (plugin.configureMcp) {
      plugin.configureMcp(mcpServer, {rootConfig});
    }
  });

  return mcpServer;
}
