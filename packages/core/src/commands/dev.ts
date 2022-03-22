import * as path from 'path';
import {cwd, env} from 'process';
import {Server} from '../server';
import Workspace from '../workspace/Workspace';

export async function dev(dirPath?: string) {
  // TODO(stevenle): load dotenv files.
  let workspaceDir = dirPath || env.CMS_WORKSPACE;
  if (workspaceDir) {
    if (!workspaceDir.startsWith('/')) {
      // Resolve relative paths.
      workspaceDir = path.resolve(cwd(), workspaceDir);
    }
  } else {
    workspaceDir = cwd();
  }
  const workspace = await Workspace.init(workspaceDir);
  const server = new Server({
    workspace: workspace,
  });
  await server.listen();
}
