import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {default as express} from 'express';
import {createServer as createViteServer} from 'vite';
import {pluginRoot} from '../../render/vite-plugin-root.js';
import {DevServerAssetMap} from '../../render/asset-map/dev-asset-map.js';
import {loadRootConfig} from '../load-config.js';
import {htmlMinify} from '../../render/html-minify.js';
import {isDirectory, isJsFile} from '../../core/fsutils.js';
import glob from 'tiny-glob';
import {dim} from 'kleur/colors';
import {Server, Request, Response, NextFunction} from '../../core/types.js';
import {configureServerPlugins} from '../../core/plugins.js';
import {RootConfig} from '../../core/config.js';
import {rootProjectMiddleware} from '../../core/middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dev(rootProjectDir?: string) {
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const server = await createServer({rootDir});
  const port = parseInt(process.env.PORT || '4007');
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://localhost:${port}`);
  console.log(`${dim('┃')} mode:     dev`);
  console.log();
  server.listen(port);
}

async function createServer(options?: {rootDir?: string}): Promise<Server> {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const rootConfig = await loadRootConfig(rootDir);

  const server = express();
  server.disable('x-powered-by');

  // Inject req context vars.
  server.use(rootProjectMiddleware({rootDir, rootConfig}));
  server.use(await viteServerMiddleware({rootDir, rootConfig}));
  server.use(rootDevRendererMiddleware());

  const plugins = rootConfig.plugins || [];
  await configureServerPlugins(
    server,
    async () => {
      // Add user-configured middlewares from `root.config.ts`.
      const userMiddlewares = rootConfig.server?.middlewares || [];
      for (const middleware of userMiddlewares) {
        server.use(middleware);
      }
      // Add the root.js dev server middlewares.
      server.use(rootDevServerMiddleware());
      server.use(rootDevServer404Middleware());
    },
    plugins,
    {type: 'dev'}
  );

  return server;
}

/**
 * Middleware that initializes a vite server and injects it into the request
 * context.
 */
async function viteServerMiddleware(options: {
  rootDir: string;
  rootConfig: RootConfig;
}) {
  const rootDir = options.rootDir;
  const rootConfig = options.rootConfig;
  const viteConfig = rootConfig.vite || {};

  const routeFiles: string[] = [];
  if (await isDirectory(path.join(rootDir, 'routes'))) {
    const pageFiles = await glob('routes/**/*', {cwd: rootDir});
    pageFiles.forEach((file) => {
      const parts = path.parse(file);
      if (!parts.name.startsWith('_') && isJsFile(parts.base)) {
        routeFiles.push(file);
      }
    });
  }

  const elementsDirs = [path.join(rootDir, 'elements')];
  const elementsInclude = rootConfig.elements?.include || [];
  const excludePatterns = rootConfig.elements?.exclude || [];
  const excludeElement = (moduleId: string) => {
    return excludePatterns.some((pattern) => Boolean(moduleId.match(pattern)));
  };

  for (const dirPath of elementsInclude) {
    const elementsDir = path.resolve(rootDir, dirPath);
    if (!elementsDir.startsWith(rootDir)) {
      throw new Error(
        `the elements dir (${dirPath}) should be relative to the project's root dir (${rootDir})`
      );
    }
    elementsDirs.push(elementsDir);
  }
  const elements: string[] = [];
  for (const dirPath of elementsDirs) {
    if (await isDirectory(dirPath)) {
      const elementFiles = await glob('**/*', {cwd: dirPath});
      elementFiles.forEach((file) => {
        const parts = path.parse(file);
        if (isJsFile(parts.base)) {
          const fullPath = path.join(dirPath, file);
          const moduleId = fullPath.slice(rootDir.length);
          if (!excludeElement(moduleId)) {
            elements.push(moduleId.slice(1));
          }
        }
      });
    }
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
    root: rootDir,
    publicDir: path.join(rootDir, 'public'),
    server: {middlewareMode: true},
    appType: 'custom',
    optimizeDeps: {
      include: [...routeFiles, ...elements, ...bundleScripts],
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
  return async (req: Request, _: Response, next: NextFunction) => {
    req.viteServer = viteServer;
    next();
  };
}

function rootDevRendererMiddleware() {
  const renderModulePath = path.resolve(__dirname, './render.js');
  return async (req: Request, _: Response, next: NextFunction) => {
    const rootConfig = req.rootConfig!;
    const viteServer = req.viteServer!;
    // Dynamically import the render.js module using vite's SSR import loader.
    const render = await viteServer.ssrLoadModule(renderModulePath);
    // Create a dev asset map using Vite dev server's module graph.
    const assetMap = new DevServerAssetMap(viteServer.moduleGraph);
    req.renderer = new render.Renderer(rootConfig, {assetMap});
    next();
  };
}

function rootDevServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl;
    const renderer = req.renderer!;
    const viteServer = req.viteServer!;
    const rootConfig = req.rootConfig!;
    try {
      const data = await renderer.render(url);
      if (data.notFound || !data.html) {
        next();
        return;
      }
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
      console.error(e);
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
}

function rootDevServer404Middleware() {
  return async (req: Request, res: Response) => {
    const url = req.originalUrl;
    const ext = path.extname(url);
    const renderer = req.renderer!;
    if (!ext) {
      const data = await renderer.renderDevServer404();
      const html = data.html || '';
      res.status(404).set({'Content-Type': 'text/html'}).end(html);
      return;
    }
    res.status(404).set({'Content-Type': 'text/plain'}).end('404');
  };
}
