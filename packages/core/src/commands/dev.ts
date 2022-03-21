import {cwd, env} from 'process';
import {Server} from '../server';
import Workspace from '../workspace/Workspace';

export async function dev(dirPath?: string) {
  // TODO(stevenle): load dotenv files.
  const workspaceDir = dirPath || env.CMS_WORKSPACE || cwd();
  const workspace = await Workspace.init(workspaceDir);
  const server = new Server({
    workspace: workspace,
  });
  await server.listen();
}
