// Server plugin that handles API routes.

import {FastifyRequest} from 'fastify';
import Application from '../Application';
import Request from '../Request';

type ProjectRequest = FastifyRequest<{
  Params: {
    project: string;
  };
}>;

/**
 * Server plugin that handles all API routes.
 *
 * For the time being, all of the API routes are currently GET requests so that
 * we can potentially run the CMS as a completely static application. At build
 * time we can statically generate all of these files. Note that this design
 * may change in the future if we do end up needing server-side handling logic.
 */
export async function api(app: Application) {
  app.get('/cms/api/workspace.json', async (req: Request) => {
    return req.workspace.serialize();
  });

  // TODO(stevenle): this api may not be needed, but is here to demonstrate the
  // ability to use url params.
  app.get('/cms/api/projects/:project.json', async (req: ProjectRequest) => {
    const projectId = req.params.project;
    const project = req.workspace.getProject(projectId);
    if (!project) {
      throw new Error(`project does not exist: ${projectId}`);
    }
    return project.serialize();
  });
}
