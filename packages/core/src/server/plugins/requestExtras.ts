// Plugin that decorates the request object with useful information.

import fp from 'fastify-plugin';
import Workspace from '../../workspace/Workspace';
import Application from '../Application';
import Request from '../Request';

declare module 'fastify' {
  interface FastifyRequest {
    path: string;
    queryString: string;
    workspace: Workspace;
    getHeader(name: string): string | null;
    getQueryParam(name: string): string | null;
    getQueryParams(name: string): string[];
  }
}

interface PluginOptions {
  workspace: Workspace;
}

export const requestExtras = fp(
  async (app: Application, {workspace}: PluginOptions) => {
    app.decorateRequest('getHeader', null);
    app.decorateRequest('getQueryParam', null);
    app.decorateRequest('getQueryParams', null);
    app.decorateRequest('path', null);
    app.decorateRequest('workspace', null);
    app.decorateRequest('queryString', null);
    app.addHook('onRequest', (fastifyReq, _res, done) => {
      const req = fastifyReq as Request;
      const url = new URL(req.url, `${req.protocol}://${req.hostname}`);
      req.path = url.pathname;
      req.queryString = url.search;
      req.getHeader = (name: string) => {
        const val = req.headers[name.toLowerCase()];
        if (Array.isArray(val)) {
          return val[0];
        }
        return val || null;
      };
      req.getQueryParam = (name: string) => {
        return url.searchParams.get(name);
      };
      req.getQueryParams = (name: string) => {
        return url.searchParams.getAll(name);
      };

      // For dev purposes, the workspace is regenerated on every request so that
      // the server does not need to be reloaded for every config change.
      // TODO(stevenle): use a static workspace in prod.
      Workspace.init(workspace.workspaceDir).then(workspace => {
        req.workspace = workspace;
        done();
      });
    });
  }
);

export default requestExtras;
