import connect from 'connect';
import {Project} from '../workspace/Project';
import {api, APIOptions} from './middleware/api';
import {cms, CMSOptions} from './middleware/cms';
import {user} from './middleware/user';

interface ServerOptions {
  api?: APIOptions;
  cms?: CMSOptions;
}

export async function createServer(project: Project, options?: ServerOptions) {
  const app = connect();
  app.use(user(project));
  app.use(api(project, options?.api));
  app.use(cms(project, options?.cms));
  return app;
}
