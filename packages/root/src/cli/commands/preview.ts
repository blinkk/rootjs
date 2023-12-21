import path from 'node:path';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import {default as express} from 'express';
import {dim} from 'kleur/colors';
import sirv from 'sirv';

import {RootConfig} from '../../core/config';
import {configureServerPlugins} from '../../core/plugin';
import {Request, Response, NextFunction, Server} from '../../core/types.js';
import {hooksMiddleware} from '../../middleware/hooks';
import {
  rootProjectMiddleware,
  trailingSlashMiddleware,
} from '../../middleware/middleware';
import {sessionMiddleware} from '../../middleware/session';
import {ElementGraph} from '../../node/element-graph.js';
import {loadBundledConfig} from '../../node/load-config';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../../render/asset-map/build-asset-map';
import {fileExists, loadJson} from '../../utils/fsutils';
import {randString} from '../../utils/rand';

type RenderModule = typeof import('../../render/render.js');

export interface PreviewOptions {
  host?: string;
}

export async function preview(
  rootProjectDir?: string,
  options?: PreviewOptions
) {
  // TODO(stevenle): figure out standard practice for NODE_ENV when using the
  // preview command.
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createPreviewServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  const host = options?.host || 'localhost';
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://${host}:${port}`);
  console.log(`${dim('┃')} mode:     preview`);
  console.log();
  server.listen(port, host);
}

export async function createPreviewServer(options: {
  rootDir: string;
}): Promise<Server> {
  const rootDir = options.rootDir;
  const rootConfig = await loadBundledConfig(rootDir, {command: 'preview'});
  const distDir = path.join(rootDir, 'dist');

  const server: Server = express();
  server.disable('x-powered-by');
  server.use(compression());

  // Inject request context vars.
  server.use(rootProjectMiddleware({rootConfig}));
  server.use(await rootPreviewRendererMiddleware({rootConfig, distDir}));
  server.use(hooksMiddleware());

  // Session middleware for handling session cookies.
  const sessionCookieSecret =
    rootConfig.server?.sessionCookieSecret || randString(36);
  server.use(cookieParser(sessionCookieSecret));
  server.use(sessionMiddleware());

  const plugins = rootConfig.plugins || [];
  configureServerPlugins(
    server,
    async () => {
      // Add user-configured middlewares from `root.config.ts`.
      const userMiddlewares = rootConfig.server?.middlewares || [];
      userMiddlewares.forEach((middleware) => {
        server.use(middleware);
      });

      // Add static file middleware.
      const publicDir = path.join(distDir, 'html');
      server.use(sirv(publicDir, {dev: false}));

      // Add the root.js preview server middlewares.
      server.use(trailingSlashMiddleware({rootConfig}));
      server.use(rootPreviewServerMiddleware());

      // Add error handlers.
      server.use(rootPreviewServer404Middleware());
      server.use(rootPreviewServer500Middleware());
    },
    plugins,
    {type: 'preview', rootConfig}
  );
  return server;
}

/**
 * Injects a renderer into the request.
 */
async function rootPreviewRendererMiddleware(options: {
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
      `could not find ${manifestPath}. run \`root build\` before \`root preview\`.`
    );
  }
  const elementGraphJsonPath = path.join(distDir, '.root/elements.json');
  if (!(await fileExists(elementGraphJsonPath))) {
    throw new Error(
      `could not find ${elementGraphJsonPath}. run \`root build\` before \`root preview\`.`
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
 * Preview server request handler.
 */
function rootPreviewServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const renderer = req.renderer!;
    try {
      await renderer.handle(req, res, next);
    } catch (e) {
      try {
        console.error(`error rendering ${req.originalUrl}`);
        console.error(e.stack || e);
        const {html} = await renderer.renderDevServer500(req, e);
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
      } catch (e2) {
        console.error('failed to render custom error');
        console.error(e2);
        next(e);
      }
    }
  };
}

function rootPreviewServer404Middleware() {
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

function rootPreviewServer500Middleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`❗ 500 ${req.originalUrl}`);
    console.error(String(err.stack || err));
    if (req.renderer) {
      const url = req.path;
      const ext = path.extname(url);
      if (!ext) {
        const renderer = req.renderer;
        const data = await renderer.renderDevServer500(req, err);
        const html = data.html || '';
        res.status(500).set({'Content-Type': 'text/html'}).end(html);
        return;
      }
    }
    next(err);
  };
}
