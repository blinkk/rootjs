import fastify, {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    path: string;
    queryString: string;
    renderingEnv?: 'prod' | 'staging';
    getHeader(name: string): string | null;
    getQueryParam(name: string): string | null;
    getQueryParams(name: string): string[];
    isUserAuthorized(): boolean;
  }
  interface FastifyReply {
    redirectToLogin(): void;
  }
}

export type Application = FastifyInstance;
export type Request = FastifyRequest;
export type Response = FastifyReply;

export class Server {
  private app: Application;

  constructor() {
    this.app = fastify();

    // Decorate the request object with useful information.
    this.app.decorateRequest('getHeader', null);
    this.app.decorateRequest('getQueryParam', null);
    this.app.decorateRequest('getQueryParams', null);
    this.app.decorateRequest('path', null);
    this.app.decorateRequest('pod', null);
    this.app.decorateRequest('queryString', null);
    this.app.addHook('onRequest', (fastifyReq, _res, done) => {
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
      done();
    });

    // TODO(stevenle): move api to its own plugin.
    this.app.post('/cms/api/workspace.json', async () => {
      return {
        success: true,
        data: {
          projects: [
            {
              id: 'project-a',
              name: 'Project A',
              domains: ['project-a.example.com'],
            },
            {
              id: 'project-b',
              name: 'Project B',
              domains: ['project-b.example.com'],
            },
          ],
        },
      };
    });
  }

  /**
   * Starts the server.
   */
  listen(port: number, cb?: (address: string) => void) {
    this.app.listen(port, (err: Error | null, address: string) => {
      if (err) {
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
      cb && cb(address);
    });
  }
}
