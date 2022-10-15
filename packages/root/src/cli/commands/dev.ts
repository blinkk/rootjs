import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {default as express, Request, Response, NextFunction} from 'express';
import {createServer as createViteServer} from 'vite';
import {pluginRoot} from '../../render/vite-plugin-root.js';
import {DevServerAssetMap} from '../../render/asset-map/dev-asset-map.js';
import {loadRootConfig} from '../load-config.js';
import {htmlMinify} from '../../render/html-minify.js';
import {Renderer} from '../../render/render.js';
import {isDirectory, isJsFile} from '../../core/fsutils.js';
import glob from 'tiny-glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer(options?: {rootDir?: string}) {
  const app = express();

  app.use(express.static('public'));
  const middlewares = await getMiddlewares({rootDir: options?.rootDir});
  middlewares.forEach((middleware) => app.use(middleware));

  const port = parseInt(process.env.PORT || '4007');
  console.log('🌳 Root.js');
  console.log();
  console.log(`Started dev server: http://localhost:${port}`);
  app.listen(port);
}

export async function getMiddlewares(options?: {rootDir?: string}) {
  const rootDir = options?.rootDir || process.cwd();
  const rootConfig = await loadRootConfig(rootDir);
  const viteConfig = rootConfig.vite || {};
  const renderModulePath = path.resolve(__dirname, './render.js');

  const pages: string[] = [];
  if (await isDirectory(path.join(rootDir, 'routes'))) {
    const pageFiles = await glob(path.join(rootDir, 'routes/**/*'));
    pageFiles.forEach((file) => {
      const parts = path.parse(file);
      if (!parts.name.startsWith('_') && isJsFile(parts.base)) {
        pages.push(file);
      }
    });
  }

  const elements: string[] = [];
  if (await isDirectory(path.join(rootDir, 'elements'))) {
    const elementFiles = await glob(path.join(rootDir, 'elements/**/*'));
    elementFiles.forEach((file) => {
      const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        elements.push(file);
      }
    });
  }

  const bundleScripts: string[] = [];
  if (await isDirectory(path.join(rootDir, 'bundles'))) {
    const bundleFiles = await glob(path.join(rootDir, 'bundles/*'));
    bundleFiles.forEach((file) => {
      const parts = path.parse(file);
      if (isJsFile(parts.base)) {
        bundleScripts.push(file);
      }
    });
  }

  const viteServer = await createViteServer({
    ...viteConfig,
    mode: 'development',
    server: {middlewareMode: true},
    appType: 'custom',
    optimizeDeps: {
      include: [...pages, ...elements, ...bundleScripts],
    },
    ssr: {
      noExternal: ['@blinkk/root'],
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    plugins: [...(viteConfig.plugins || []), pluginRoot({rootDir, rootConfig})],
  });

  const rootMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const url = req.originalUrl;
    let renderer: Renderer | null = null;
    try {
      const render = await viteServer.ssrLoadModule(renderModulePath);
      renderer = new render.Renderer(rootConfig) as Renderer;
      // Create a dev asset map using Vite dev server's module graph.
      const assetMap = new DevServerAssetMap(viteServer.moduleGraph);
      const data = await renderer.render(url, {
        assetMap: assetMap,
      });
      // Inject the Vite HMR client.
      let html = await viteServer.transformIndexHtml(url, data.html || '');
      if (rootConfig.minifyHtml !== false) {
        html = await htmlMinify(html);
      }
      res.status(200).set({'Content-Type': 'text/html'}).end(html);
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      viteServer.ssrFixStacktrace(e);
      try {
        if (renderer) {
          const {html} = await renderer.renderError(e);
          res.status(500).set({'Content-Type': 'text/html'}).end(html);
        } else {
          next(e);
        }
      } catch (e2) {
        console.error('failed to render custom error');
        console.error(e2);
        next(e);
      }
    }
  };

  return [viteServer.middlewares, rootMiddleware];
}

export async function dev(rootDir?: string) {
  process.env.NODE_ENV = 'development';
  try {
    await createServer({rootDir});
  } catch (err) {
    console.error('an error occurred');
  }
}
