import path from 'path';
import {cwd} from 'process';
import {createServer} from '../server/createServer';
import {loadEnv} from '../utils/loadEnv';
import {Project} from '../workspace/Project';

export async function dev(dirPath?: string) {
  let projectDir = dirPath || process.env.ROOT_PROJECT;
  if (projectDir) {
    if (!projectDir.startsWith('/')) {
      // Resolve relative paths.
      projectDir = path.resolve(cwd(), projectDir);
    }
  } else {
    projectDir = cwd();
  }
  loadEnv(projectDir, {mode: 'development'});

  const project = await Project.init(projectDir);
  const app = await createServer(project);
  app.listen(process.env.PORT || 4007);
}
