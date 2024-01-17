import path from 'node:path';
import {fileURLToPath} from 'node:url';

import cookieParser from 'cookie-parser';
import {default as express} from 'express';
import {dim} from 'kleur/colors';
import sirv from 'sirv';
import glob from 'tiny-glob';

import {ViteDevServer} from 'vite';
import {RootConfig} from '../../core/config.js';
import {configureServerPlugins} from '../../core/plugin.js';
import {Server, Request, Response, NextFunction} from '../../core/types.js';
import {hooksMiddleware} from '../../middleware/hooks.js';
import {
  rootProjectMiddleware,
  trailingSlashMiddleware,
} from '../../middleware/middleware.js';
import {redirectsMiddleware} from '../../middleware/redirects.js';
import {sessionMiddleware} from '../../middleware/session.js';
import {getElements, getElementsDirs} from '../../node/element-graph.js';
import {loadRootConfig} from '../../node/load-config.js';
import {createViteServer} from '../../node/vite.js';
import {DevServerAssetMap} from '../../render/asset-map/dev-asset-map.js';
import {dirExists, isDirectory, isJsFile} from '../../utils/fsutils.js';
import {findOpenPort} from '../../utils/ports.js';
import {randString} from '../../utils/rand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RenderModule = typeof import('../../render/render.js');

export interface DevOptions {
  host?: string;
}

export async function dev(rootProjectDir?: string, options?: DevOptions) {
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const defaultPort = parseInt(process.env.PORT || '4007');
  const host = options?.host || 'localhost';
  const port = await findOpenPort(defaultPort, defaultPort + 10);
  const server = await createDevServer({rootDir, port});
  const rootConfig: RootConfig = server.get('rootConfig');
  const basePath = rootConfig.base || '';
  console.log();
  console.log(`${dim('┃')} project:  ${rootDir}`);
  console.log(`${dim('┃')} server:   http://${host}:${port}${basePath}`);
  if (testCmsEnabled(rootConfig)) {
    console.log(`${dim('┃')} cms:      http://${host}:${port}/cms/`);
  }
  console.log(`${dim('┃')} mode:     development`);
  console.log();
  server.listen(port, host);
}

export async function createDevServer(options?: {
  rootDir?: string;
  port?: number;
}): Promise<Server> {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const rootConfig = await loadRootConfig(rootDir, {command: 'dev'});
  const port = options?.port;

  const server: Server = express();
  server.set('rootConfig', rootConfig);
  server.disable('x-powered-by');

  // Create viteServer.
  const {viteServer, viteMiddleware} = await createViteMiddleware({
    rootConfig,
    port,
  });

  // Inject req context vars.
  server.use(rootProjectMiddleware({rootConfig}));
  server.use(viteMiddleware);
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
      for (const middleware of userMiddlewares) {
        server.use(middleware);
      }

      // Add redirects middleware.
      if (rootConfig.server?.redirects) {
        server.use(
          redirectsMiddleware({redirects: rootConfig.server.redirects})
        );
      }

      // Add static file middleware.
      const publicDir = path.join(rootDir, 'public');
      if (await dirExists(publicDir)) {
        server.use(rootPublicDirMiddleware({publicDir, viteServer}));
      }

      // Add the root.js dev server middlewares.
      server.use(trailingSlashMiddleware({rootConfig}));
      server.use(rootDevServerMiddleware());
      server.use(rootDevServer404Middleware());
      server.use(rootDevServer500Middleware());
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
async function createViteMiddleware(options: {
  rootConfig: RootConfig;
  port?: number;
}) {
  const rootConfig = options.rootConfig;
  const rootDir = rootConfig.rootDir;

  let elementGraph = await getElements(rootConfig);
  const elements = Object.values(elementGraph.sourceFiles).map((sourceFile) => {
    return sourceFile.relPath;
  });

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

  const optimizeDeps = [...elements, ...bundleScripts];
  const viteServer = await createViteServer(rootConfig, {
    port: options.port,
    optimizeDeps: optimizeDeps,
  });

  // Watch for file changes and re-generate the elements graph if any elements
  // are added or deleted.
  function isInElementsDir(changedFilePath: string) {
    const filePath = path.resolve(changedFilePath);
    const elementsDirs = getElementsDirs(rootConfig);
    return elementsDirs.some((dirPath) => filePath.startsWith(dirPath));
  }
  viteServer.watcher.on('add', async (filePath: string) => {
    if (isInElementsDir(filePath)) {
      // Re-generate the elements graph.
      elementGraph = await getElements(rootConfig);
      console.log(`element added: ${filePath}`);
    }
  });
  viteServer.watcher.on('unlink', async (filePath: string) => {
    if (isInElementsDir(filePath)) {
      // Re-generate the elements graph.
      elementGraph = await getElements(rootConfig);
      console.log(`element deleted: ${filePath}`);
    }
  });

  const viteMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Add the viteServer to the req.
      req.viteServer = viteServer;
      // Dynamically import the render.js module using vite's SSR import loader.
      const renderModulePath = path.resolve(__dirname, './render.js');
      const render = (await viteServer.ssrLoadModule(
        renderModulePath
      )) as RenderModule;
      // Create a dev asset map using Vite dev server's module graph.
      const assetMap = new DevServerAssetMap(
        rootConfig,
        viteServer.moduleGraph
      );
      // Add a renderer object to the req for plugins and other middleware to
      // use.
      req.renderer = new render.Renderer(rootConfig, {assetMap, elementGraph});
      // Run the viteServer middlewares to handle vite-specific endpoints.
      viteServer.middlewares(req, res, next);
    } catch (e) {
      next(e);
    }
  };

  return {viteServer, viteMiddleware};
}

function rootPublicDirMiddleware(options: {
  publicDir: string;
  viteServer: ViteDevServer;
}) {
  const publicDir = options.publicDir;
  // The `{dev: false}` option is used for performance reasons. When dev is set
  // to `true`, every request will traverse the filesystem to check if a
  // matching file exists. Setting it to `false` uses a cache, which can be
  // reloaded whenever a file change is detected in the `public` directory.
  const sirvOptions = {dev: false};
  let handler = sirv(publicDir, sirvOptions);

  function reloadPublicDirCache() {
    handler = sirv(publicDir, sirvOptions);
  }

  function isInPublicDir(changedFilePath: string) {
    const filePath = path.resolve(changedFilePath);
    return filePath.startsWith(publicDir);
  }

  const watcher = options.viteServer.watcher;
  watcher.on(
    'all',
    debounce((event, filepath) => {
      if (isInPublicDir(filepath)) {
        console.log(`${filepath} changed, reloading public files`);
        reloadPublicDirCache();
      }
    }, 1000)
  );

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next);
  };
}

function rootDevServerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const renderer = req.renderer!;
    const viteServer = req.viteServer!;
    try {
      await renderer.handle(req, res, next);
    } catch (err) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      viteServer.ssrFixStacktrace(err);
      next(err);
    }
  };
}

function rootDevServer404Middleware() {
  return async (req: Request, res: Response) => {
    console.error(`❓ 404 ${req.originalUrl}`);
    if (req.renderer) {
      const url = req.path;
      const ext = path.extname(url);
      if (!ext) {
        const renderer = req.renderer;
        const data = await renderer.renderDevServer404(req);
        const html = data.html || '';
        res.status(404).set({'Content-Type': 'text/html'}).end(html);
        return;
      }
    }
    res.status(404).set({'Content-Type': 'text/plain'}).end('404');
  };
}

function rootDevServer500Middleware() {
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

function testCmsEnabled(rootConfig: RootConfig) {
  const plugins = rootConfig.plugins || [];
  return Boolean(plugins.find((plugin) => plugin.name === 'root-cms'));
}

function debounce(fn: (...args: any[]) => any, timeout: number) {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), timeout);
  };
}
