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
import {configureServerPlugins, getVitePlugins} from '../../core/plugin.js';
import {RootConfig} from '../../core/config.js';
import {rootProjectMiddleware} from '../../core/middleware.js';
import {findOpenPort} from '../ports.js';
import {getElements} from '../../core/elements.js';
import {htmlPretty} from '../../render/html-pretty.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dev(rootProjectDir?: string) {
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const defaultPort = parseInt(process.env.PORT || '4007');
  const port = await findOpenPort(defaultPort, defaultPort + 10);
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://localhost:${port}`);
  console.log(`${dim('┃')} mode:     development`);
  console.log();
  const server = await createServer({rootDir, port});
  server.listen(port);
}

async function createServer(options?: {
  rootDir?: string;
  port?: number;
}): Promise<Server> {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const rootConfig = await loadRootConfig(rootDir);
  const port = options?.port;

  const server = express();
  server.disable('x-powered-by');

  // Inject req context vars.
  server.use(rootProjectMiddleware({rootDir, rootConfig}));
  server.use(await viteServerMiddleware({rootDir, rootConfig, port}));
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
    {type: 'dev', rootConfig}
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
  port?: number;
}) {
  const rootDir = options.rootDir;
  const rootConfig = options.rootConfig;
  const viteConfig = rootConfig.vite || {};

  let hmrOptions = viteConfig.server?.hmr;
  if (typeof hmrOptions === 'undefined' && options.port) {
    // Automatically set the HMR port to `port + 10`. This allows multiple
    // root.js dev servers to run without conflicts.
    hmrOptions = {port: options.port + 10};
  }

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

  const elementsMap = await getElements(rootConfig);
  const elements = Object.values(elementsMap).map((mod) => mod.src);

  const bundleScripts: string[] = [];
  if (await isDirectory(path.join(rootDir, 'bundles'))) {
    const bundleFiles = await glob('bundles/*', {cwd: rootDir});
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
    server: {
      ...(viteConfig.server || {}),
      middlewareMode: true,
      hmr: hmrOptions,
    },
    appType: 'custom',
    optimizeDeps: {
      ...(viteConfig.optimizeDeps || {}),
      include: [
        ...routeFiles,
        ...elements,
        ...bundleScripts,
        ...(viteConfig.optimizeDeps?.include || []),
      ],
    },
    ssr: {
      ...(viteConfig.ssr || {}),
      noExternal: ['@blinkk/root'],
    },
    esbuild: {
      ...(viteConfig.esbuild || {}),
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    plugins: [
      await pluginRoot({rootConfig}),
      ...(viteConfig.plugins || []),
      ...getVitePlugins(rootConfig.plugins || []),
    ],
  });
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.viteServer = viteServer;
      viteServer.middlewares(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

function rootDevRendererMiddleware() {
  const renderModulePath = path.resolve(__dirname, './render.js');
  return async (req: Request, _: Response, next: NextFunction) => {
    const rootConfig = req.rootConfig!;
    const viteServer = req.viteServer!;
    try {
      // Dynamically import the render.js module using vite's SSR import loader.
      const render = await viteServer.ssrLoadModule(renderModulePath);
      // Create a dev asset map using Vite dev server's module graph.
      const assetMap = new DevServerAssetMap(
        rootConfig,
        viteServer.moduleGraph
      );
      req.renderer = new render.Renderer(rootConfig, {assetMap});
      next();
    } catch (e) {
      next(e);
    }
  };
}

function rootDevServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const url = req.path;
    const renderer = req.renderer!;
    const viteServer = req.viteServer!;
    const rootConfig = req.rootConfig!;
    try {
      await renderer.handle(req, res, next);
      // if (data.notFound || !data.html) {
      //   next();
      //   return;
      // }
      // // Inject the Vite HMR client.
      // let html = await viteServer.transformIndexHtml(url, data.html || '');
      // if (rootConfig.prettyHtml !== false) {
      //   html = await htmlPretty(html, rootConfig.prettyHtmlOptions);
      // }
      // // HTML minification is `true` by default. Set to `false` to disable.
      // if (rootConfig.minifyHtml !== false) {
      //   html = await htmlMinify(html, rootConfig.minifyHtmlOptions);
      // }
      // res.status(200).set({'Content-Type': 'text/html'}).end(html);
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
    const url = req.path;
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
