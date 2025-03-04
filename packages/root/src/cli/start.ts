import path from 'node:path';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import {default as express} from 'express';
import {dim} from 'kleur/colors';
import sirv from 'sirv';

import {RootConfig} from '../core/config.js';
import {configureServerPlugins} from '../core/plugin.js';
import {Request, Response, NextFunction, Server} from '../core/types.js';
import {hooksMiddleware} from '../middleware/hooks.js';
import {
  headersMiddleware,
  rootProjectMiddleware,
  trailingSlashMiddleware,
} from '../middleware/middleware.js';
import {redirectsMiddleware} from '../middleware/redirects.js';
import {sessionMiddleware} from '../middleware/session.js';
import {ElementGraph} from '../node/element-graph.js';
import {loadBundledConfig} from '../node/load-config.js';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../render/asset-map/build-asset-map.js';
import {fileExists, loadJson} from '../utils/fsutils.js';
import {randString} from '../utils/rand.js';

type RenderModule = typeof import('../render/render.js');

export interface StartOptions {
  host?: string;
}

export async function start(rootProjectDir?: string, options?: StartOptions) {
  process.env.NODE_ENV = 'production';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createProdServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  const host = options?.host || 'localhost';
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://${host}:${port}`);
  console.log(`${dim('┃')} mode:     production`);
  console.log();
  server.listen(port, host);
}

export async function createProdServer(options: {
  rootDir: string;
}): Promise<Server> {
  const rootDir = options.rootDir;
  const rootConfig = await loadBundledConfig(rootDir, {command: 'start'});
  const distDir = path.join(rootDir, 'dist');

  const server: Server = express();
  server.disable('x-powered-by');
  server.use(compression());

  // Inject request context vars.
  server.use(rootProjectMiddleware({rootConfig}));
  server.use(await rootProdRendererMiddleware({rootConfig, distDir}));
  server.use(hooksMiddleware());

  // Session middleware for handling session cookies.
  const sessionCookieSecret =
    rootConfig.server?.sessionCookieSecret || randString(36);
  server.use(cookieParser(sessionCookieSecret));
  server.use(sessionMiddleware());

  const plugins = rootConfig.plugins || [];
  await configureServerPlugins(
    server,
    async () => {
      // Add user-configured middlewares from `root.config.ts`.
      const userMiddlewares = rootConfig.server?.middlewares || [];
      userMiddlewares.forEach((middleware) => {
        server.use(middleware);
      });

      // Add redirects middleware.
      if (rootConfig.server?.redirects) {
        server.use(
          redirectsMiddleware({redirects: rootConfig.server.redirects})
        );
      }

      // Add http headers middleware.
      if (rootConfig.server?.headers) {
        server.use(headersMiddleware({rootConfig: rootConfig}));
      }

      // Add static file middleware.
      const publicDir = path.join(distDir, 'html');
      server.use(sirv(publicDir, {dev: false}));

      // NOTE: The trailing slash middleware needs to come after public files so
      // that slashes are not appended to public file routes.
      server.use(trailingSlashMiddleware({rootConfig}));

      // Add the root.js preview server middlewares.
      server.use(rootProdServerMiddleware());

      // Add any custom plugin 404 handlers.
      plugins.forEach((plugin) => {
        if (plugin.handle404) {
          server.use(plugin.handle404);
        }
      });

      // Add error handlers.
      server.use(rootProdServer404Middleware());
      server.use(rootProdServer500Middleware());
    },
    plugins,
    {type: 'prod', rootConfig}
  );
  return server;
}

/**
 * Injects a renderer into the request.
 */
async function rootProdRendererMiddleware(options: {
  rootConfig: RootConfig;
  distDir: string;
}) {
  const {distDir, rootConfig} = options;
  const render: RenderModule = await import(
    path.join(distDir, 'server/render.js')
  );
  const manifestPath = path.join(distDir, '.root/manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `could not find ${manifestPath}. run \`root build\` before \`root start\`.`
    );
  }
  const elementGraphJsonPath = path.join(distDir, '.root/elements.json');
  if (!(await fileExists(elementGraphJsonPath))) {
    throw new Error(
      `could not find ${elementGraphJsonPath}. run \`root build\` before \`root start\`.`
    );
  }
  const rootManifest = await loadJson<BuildAssetManifest>(manifestPath);
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, rootManifest);
  const elementGraphJson = await loadJson<any>(elementGraphJsonPath);
  const elementGraph = ElementGraph.fromJson(elementGraphJson);
  const renderer = new render.Renderer(rootConfig, {assetMap, elementGraph});
  return async (req: Request, _: Response, next: NextFunction) => {
    req.renderer = renderer;
    next();
  };
}

/**
 * Prod server request handler.
 */
function rootProdServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const renderer = req.renderer!;
    try {
      await renderer.handle(req, res, next);
    } catch (e) {
      try {
        console.error(`error rendering ${req.originalUrl}`);
        console.error(e.stack || e);
        const {html} = await renderer.renderError(e);
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
      } catch (e2) {
        console.error('failed to render custom error');
        console.error(e2);
        next(e);
      }
    }
  };
}

function rootProdServer404Middleware() {
  return async (req: Request, res: Response) => {
    console.error(`❓ 404 ${req.originalUrl}`);
    if (req.renderer) {
      const url = req.path;
      const ext = path.extname(url);
      if (!ext) {
        const renderer = req.renderer;
        const data = await renderer.render404({currentPath: url});
        const html = data.html || '';
        res.status(404).set({'Content-Type': 'text/html'}).end(html);
        return;
      }
    }
    res.status(404).set({'Content-Type': 'text/plain'}).end('404');
  };
}

function rootProdServer500Middleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`❗ 500 ${req.originalUrl}`);
    console.error(String(err.stack || err));
    if (req.renderer) {
      const url = req.path;
      const ext = path.extname(url);
      if (!ext) {
        const renderer = req.renderer;
        const data = await renderer.renderError(err);
        const html = data.html || '';
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
        return;
      }
    }
    next(err);
  };
}
