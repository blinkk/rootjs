import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {RootCMSClient} from '../core/client.js';
import {createMcpServer} from '../core/mcp.js';
import {generateTypes} from './generate-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMcpServer(options?: {cwd?: string}) {
  const rootDir = options?.cwd ? path.resolve(options.cwd) : process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});

  // Load the project module to access schemas.
  const projectModulePath = path.resolve(__dirname, './project.js');
  let projectModule: any;

  async function loadProject() {
    projectModule = (await viteSsrLoadModule(
      rootConfig,
      projectModulePath
    )) as any;
  }

  await loadProject();

  const cmsClient = new RootCMSClient(rootConfig);

  const server = await createMcpServer({
    name: 'root-cms-mcp',
    version: '0.0.1',
    cmsClient,
    projectModule,
    loadProject,
    generateTypes,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
