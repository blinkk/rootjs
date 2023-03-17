import path from 'node:path';
import {default as express} from 'express';
import {Request, Response, NextFunction, Server} from '../../core/types.js';
import {loadRootConfig} from '../load-config';
import {Renderer} from '../../render/render.js';
import {fileExists, loadJson} from '../../utils/fsutils';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../../render/asset-map/build-asset-map';
import {dim} from 'kleur/colors';
import {configureServerPlugins} from '../../core/plugin';
import sirv from 'sirv';
import compression from 'compression';
import {rootProjectMiddleware} from '../../core/middleware';
import {RootConfig} from '../../core/config';
import {getElements} from '../../core/element-graph.js';

type RenderModule = typeof import('../../render/render.js');

export async function preview(rootProjectDir?: string) {
  // TODO(stevenle): figure out standard practice for NODE_ENV when using the
  // preview command.
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://localhost:${port}`);
  console.log(`${dim('┃')} mode:     preview`);
  console.log();
  server.listen(port);
}

async function createServer(options: {rootDir: string}): Promise<Server> {
  const rootDir = options.rootDir;
  const rootConfig = await loadRootConfig(rootDir);
  const distDir = path.join(rootDir, 'dist');

  const server = express();
  server.disable('x-powered-by');
  server.use(compression());

  // Inject request context vars.
  server.use(rootProjectMiddleware({rootDir, rootConfig}));
  server.use(await rootPreviewRendererMiddleware({rootConfig, distDir}));

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
  const manifestPath = path.join(distDir, 'client/root-manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(
      `could not find ${manifestPath}. run \`root build\` before \`root preview\`.`
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
 * Preview server request handler.
 */
function rootPreviewServerMiddleware() {
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

function rootPreviewServer404Middleware() {
  return async (req: Request, res: Response) => {
    console.error(`❓ 404 ${req.originalUrl}`);
    const url = req.path;
    const ext = path.extname(url);
    const renderer = req.renderer!;
    if (!ext) {
      const data = await renderer.render404();
      const html = data.html || '';
      res.status(404).set({'Content-Type': 'text/html'}).end(html);
      return;
    }
    res.status(404).set({'Content-Type': 'text/plain'}).end('404');
  };
}

function rootPreviewServer500Middleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`❗ 500 ${req.originalUrl}`);
    console.error(String(err.stack || err));
    const url = req.path;
    const ext = path.extname(url);
    const renderer = req.renderer!;
    if (!ext) {
      const data = await renderer.renderError(err);
      const html = data.html || '';
      res.status(500).set({'Content-Type': 'text/html'}).end(html);
      return;
    }
    next(err);
  };
}
