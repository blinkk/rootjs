import path from 'node:path';
import {default as express} from 'express';
import {loadRootConfig} from '../load-config';
import {Renderer} from '../../render/render.js';
import {fileExists, loadJson} from '../../core/fsutils';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../../render/asset-map/build-asset-map';
import {htmlMinify} from '../../render/html-minify';
import {dim} from 'kleur/colors';
import {configureServerPlugins} from '../../core/plugin';
import sirv from 'sirv';
import compression from 'compression';
import {Request, Response, NextFunction, Server} from '../../core/types.js';
import {rootProjectMiddleware} from '../../core/middleware';
import {RootConfig} from '../../core/config';

type RenderModule = typeof import('../../render/render.js');

export async function start(rootProjectDir?: string) {
  process.env.NODE_ENV = 'production';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://localhost:${port}`);
  console.log(`${dim('┃')} mode:     production`);
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
      // TODO(stevenle): handle 404/500 errors.
    },
    plugins,
    {type: 'prod'}
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
      `could not find ${manifestPath}. run \`root build\` before \`root preview\`.`
    );
  }
  const rootManifest = await loadJson<BuildAssetManifest>(manifestPath);
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, rootManifest);
  const renderer = new render.Renderer(rootConfig, {assetMap}) as Renderer;
  return async (req: Request, _: Response, next: NextFunction) => {
    req.renderer = renderer;
    next();
  };
}

/**
 * Preview server request handler.
 */
function rootProdServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rootConfig = req.rootConfig!;
    const renderer = req.renderer!;
    try {
      const url = req.path;
      const data = await renderer.render(url);
      if (data.notFound || !data.html) {
        next();
        return;
      }
      let html = data.html || '';
      // HTML minification is `true` by default. Set to `false` to disable.
      if (rootConfig.minifyHtml !== false) {
        html = await htmlMinify(html, rootConfig.minifyHtmlOptions);
      }
      res.status(200).set({'Content-Type': 'text/html'}).end(html);
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
