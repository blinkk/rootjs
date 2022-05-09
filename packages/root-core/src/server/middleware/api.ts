import {Project} from '../../workspace/Project';
import * as server from '../types';

// Endpoints that do not require auth.
const PUBLIC_ENDPOINTS = new Set(['firebase.get_config']);

interface APIRequestContext {
  project: Project;
  req: server.Request;
}

type APIHandler<ReqBody, ResBody> = (
  ctx: APIRequestContext,
  reqBody?: ReqBody
) => Promise<ResBody>;

class APIRouter {
  routes: Record<string, APIHandler<any, any>> = {};

  add<ReqBody = {}, ResBody = {}>(
    endpoint: string,
    handler: APIHandler<ReqBody, ResBody>
  ) {
    this.routes[endpoint] = handler;
  }

  get(endpoint: string): APIHandler<any, any> | null {
    return this.routes[endpoint] || null;
  }
}

const router = new APIRouter();

router.add('project.get', async (ctx: APIRequestContext) => {
  return ctx.project.serialize();
});

router.add('firebase.get_config', async (ctx: APIRequestContext) => {
  const projectId = ctx.project.config.gcpProjectId;
  const apiKey = process.env.FIREBASE_API_KEY;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
  if (!apiKey || !authDomain) {
    throw new Error(
      'missing firebase credentials, please set environment variables: FIREBASE_API_KEY and FIREBASE_AUTH_DOMAIN'
    );
  }
  return {projectId, apiKey, authDomain};
});

export interface APIOptions {
  base?: string;
}

export function api(project: Project, options?: APIOptions) {
  const base = options?.base || '/cms/api';
  return async (
    req: server.Request,
    res: server.Response,
    next: server.NextFunction
  ) => {
    if (!req.originalUrl?.startsWith(base)) {
      return next();
    }

    let prefix = base;
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }

    const endpoint = req.originalUrl.slice(prefix.length);
    if (!PUBLIC_ENDPOINTS.has(endpoint)) {
      if (!req.currentUser) {
        res.writeHead(401, {'Content-Type': 'application/json'});
        res.write(JSON.stringify({success: false, error: '401 Unauthorized'}));
        res.end();
        return;
      }

      const isAuthorized = await project.isAuthorized(req.currentUser);
      if (!isAuthorized) {
        res.writeHead(403, {'Content-Type': 'application/json'});
        res.write(JSON.stringify({success: false, error: '403 Forbidden'}));
        res.end();
        return;
      }
    }

    const handler = router.get(endpoint);
    if (!handler) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.write(JSON.stringify({success: false, error: 'Not found'}));
      res.end();
      return;
    }

    try {
      const ctx: APIRequestContext = {project, req};
      let reqBody: unknown;
      if (
        req.method === 'POST' &&
        req.headers['content-type'] === 'application/json'
      ) {
        reqBody = await parseJson(req);
      }
      const resBody = await handler(ctx, reqBody);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.write(JSON.stringify({success: true, data: resBody}));
      res.end();
    } catch (e) {
      const err = e as Error;
      console.error(err);
      console.error(err.stack);
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.write(
        JSON.stringify({success: false, error: 'Unknown server error'})
      );
      res.end();
    }
  };
}

async function parseJson(req: server.Request) {
  return {};
}
