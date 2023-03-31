import path from 'node:path';
import {default as express} from 'express';
import {loadRootConfig} from '../../node/load-config';
import {fileExists, loadJson} from '../../utils/fsutils';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../../render/asset-map/build-asset-map';
import {dim} from 'kleur/colors';
import {configureServerPlugins} from '../../core/plugin';
import sirv from 'sirv';
import compression from 'compression';
import {Request, Response, NextFunction, Server} from '../../core/types.js';
import {rootProjectMiddleware} from '../../core/middleware';
import {RootConfig} from '../../core/config';
import {getElements} from '../../node/element-graph';

type RenderModule = typeof import('../../render/render.js');

export async function start(rootProjectDir?: string) {
  process.env.NODE_ENV = 'production';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createProdServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://localhost:${port}`);
  console.log(`${dim('┃')} mode:     production`);
  console.log();
  server.listen(port);
}

export async function createProdServer(options: {
  rootDir: string;
}): Promise<Server> {
  const rootDir = options.rootDir;
  const rootConfig = await loadRootConfig(rootDir, {command: 'start'});
  const distDir = path.join(rootDir, 'dist');

  const server = express();
  server.disable('x-powered-by');
  server.use(compression());

  // Inject request context vars.
  server.use(rootProjectMiddleware({rootConfig}));
  server.use(await rootProdRendererMiddleware({rootConfig, distDir}));

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
      server.use(rootProdServerMiddleware());

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
  const manifestPath = path.join(distDir, 'client/root-manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `could not find ${manifestPath}. run \`root build\` before \`root start\`.`
    );
  }
  const rootManifest = await loadJson<BuildAssetManifest>(manifestPath);
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, rootManifest);
  const elementGraph = await getElements(rootConfig);
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
        const data = await renderer.render404();
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
