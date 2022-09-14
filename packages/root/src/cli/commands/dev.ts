import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {default as express, Request, Response, NextFunction} from 'express';
import {createServer as createViteServer} from 'vite';
import pluginRoot from '../../render/vite-plugin-root.js';
import {DevServerAssetMap} from '../../render/asset-map/dev-asset-map.js';
import {loadRootConfig} from '../load-config.js';
import {htmlMinify} from '../../render/html-minify.js';
import {Renderer} from '../../render/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer(options?: {rootDir?: string}) {
  const app = express();

  app.use(express.static('public'));
  const middlewares = await getMiddlewares({rootDir: options?.rootDir});
  middlewares.forEach((middleware) => app.use(middleware));

  const port = parseInt(process.env.PORT || '4007');
  const version = process.env.npm_package_version || 'dev';
  console.log(`🌳 Root.js v${version}`);
  console.log();
  console.log(`Started server: http://localhost:${port}`);
  app.listen(port);
}

export async function getMiddlewares(options?: {rootDir?: string}) {
  const rootDir = options?.rootDir || process.cwd();
  const rootConfig = await loadRootConfig(rootDir);
  const viteConfig = rootConfig.vite || {};
  const renderModulePath = path.resolve(__dirname, './render.js');

  const viteServer = await createViteServer({
    ...viteConfig,
    server: {middlewareMode: true},
    appType: 'custom',
    optimizeDeps: {
      include: [renderModulePath],
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    plugins: [...(viteConfig.plugins || []), pluginRoot()],
  });

  const rootMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const url = req.originalUrl;
    const render = await viteServer.ssrLoadModule(renderModulePath);
    const renderer = new render.Renderer(rootConfig) as Renderer;
    try {
      // Create a dev asset map using Vite dev server's module graph.
      const assetMap = new DevServerAssetMap(viteServer.moduleGraph);
      const data = await renderer.render(url, {
        assetMap: assetMap,
      });
      // Inject the Vite HMR client.
      const html = await htmlMinify(
        await viteServer.transformIndexHtml(url, data.html || '')
      );

      res.status(200).set({'Content-Type': 'text/html'}).end(html);
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      viteServer.ssrFixStacktrace(e);
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

  return [viteServer.middlewares, rootMiddleware];
}

export function dev(rootDir?: string) {
  createServer({rootDir});
}
