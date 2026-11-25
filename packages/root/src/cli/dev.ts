import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import cookieParser from 'cookie-parser';
import {default as express} from 'express';
import {dim} from 'kleur/colors';
import sirv from 'sirv';
import glob from 'tiny-glob';

import {normalizePath, ViteDevServer} from 'vite';
import {RootConfig} from '../core/config.js';
import {configureServerPlugins} from '../core/plugin.js';
import {Server, Request, Response, NextFunction} from '../core/types.js';
import {hooksMiddleware} from '../middleware/hooks.js';
import {
  headersMiddleware,
  rootProjectMiddleware,
  securityHeadersMiddleware,
  trailingSlashMiddleware,
} from '../middleware/middleware.js';
import {redirectsMiddleware} from '../middleware/redirects.js';
import {sessionMiddleware} from '../middleware/session.js';
import {
  ElementGraph,
  getElements,
  getElementsDirs,
  resolveRealPathSync,
} from '../node/element-graph.js';
import {loadRootConfigWithDeps} from '../node/load-config.js';
import {collectPods} from '../node/pod-collector.js';
import {createViteServer} from '../node/vite.js';
import {DevServerAssetMap} from '../render/asset-map/dev-asset-map.js';
import type {Renderer} from '../render/render.js';
import {dirExists, isDirectory, isJsFile} from '../utils/fsutils.js';
import {findOpenPort} from '../utils/ports.js';
import {getSessionCookieSecret} from '../utils/rand.js';
import {syncSecretsOnDev} from './secrets.js';
import {runStartupTasks} from './startup/startup-tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RenderModule = typeof import('../render/render.js');
const DEV_SERVER_404_LOG_IGNORE_PATHS = new Set([
  '/.well-known/appspecific/com.chrome.devtools.json',
]);

export interface DevOptions {
  host?: string;
  version?: string;
}

export async function dev(rootProjectDir?: string, options?: DevOptions) {
  process.env.NODE_ENV = 'development';
  const rootDir = path.resolve(rootProjectDir || process.cwd());
  const defaultPort = parseInt(process.env.PORT || '4007');
  const host = options?.host || 'localhost';
  const port = await findOpenPort(defaultPort, defaultPort + 10);

  // Block on a secrets sync (if configured) so managed values are live before
  // the server starts. Bounded by an internal timeout; never throws.
  await syncSecretsOnDev(rootDir);

  // Run startup tasks (e.g. the npm version check) without blocking server
  // startup. Failures are handled internally and never interrupt `root dev`.
  void runStartupTasks({rootDir, version: options?.version});

  let currentServer: http.Server | null = null;
  let currentViteServer: ViteDevServer | null = null;

  async function start() {
    const server = await createDevServer({rootDir, port});
    const rootConfig: RootConfig = server.get('rootConfig');
    const viteServer: ViteDevServer = server.get('viteServer');
    currentViteServer = viteServer;

    const basePath = rootConfig.base || '';
    const homePagePath = rootConfig.server?.homePagePath || basePath;
    console.log();
    console.log(`${dim('┃')} project:  ${rootDir}`);
    console.log(`${dim('┃')} server:   http://${host}:${port}${homePagePath}`);
    if (testCmsEnabled(rootConfig)) {
      console.log(`${dim('┃')} cms:      http://${host}:${port}/cms/`);
    }
    console.log(`${dim('┃')} mode:     development`);
    console.log();
    currentServer = server.listen(port, host);

    // Watch for config changes.
    const rootConfigDependencies: string[] = server.get(
      'rootConfigDependencies'
    );
    const dependencies = [
      path.resolve(rootDir, 'root.config.ts'),
      ...rootConfigDependencies,
    ];
    viteServer.watcher.add(dependencies);
    viteServer.watcher.on('change', async (file) => {
      if (dependencies.includes(file)) {
        console.log(
          `\n${dim('┃')} root.config.ts changed. restarting server...`
        );
        await restart();
      }
    });
  }

  async function restart() {
    if (currentServer) {
      currentServer.close();
      currentServer = null;
    }
    if (currentViteServer) {
      await currentViteServer.close();
      currentViteServer = null;
    }
    await start();
  }

  await start();
}

export async function createDevServer(options?: {
  rootDir?: string;
  port?: number;
}): Promise<Server> {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const {rootConfig, dependencies} = await loadRootConfigWithDeps(rootDir, {
    command: 'dev',
  });
  const port = options?.port;

  const server: Server = express();
  server.set('rootConfig', rootConfig);
  server.set('rootConfigDependencies', dependencies);
  server.disable('x-powered-by');

  // Create viteServer.
  const {viteServer, viteMiddleware, getRenderer} = await createViteMiddleware({
    rootConfig,
    port,
  });
  server.set('viteServer', viteServer);

  // Inject req context vars.
  server.use(rootProjectMiddleware({rootConfig}));
  // Set security-related HTTP headers (e.g. HSTS) on all responses. The
  // renderer re-sets these on rendered HTML responses (along with the
  // per-request CSP nonce).
  server.use(securityHeadersMiddleware({rootConfig}));
  server.use(viteMiddleware);
  server.use(hooksMiddleware());

  // Session middleware for handling session cookies.
  const sessionCookieSecret = getSessionCookieSecret(rootConfig, rootDir);
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

      // Add redirects middlewares.
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
      const publicDir = path.join(rootDir, 'public');
      if (await dirExists(publicDir)) {
        server.use(rootPublicDirMiddleware({publicDir, viteServer}));
      }

      // NOTE: The trailing slash middleware needs to come after public files so
      // that slashes are not appended to public file routes.
      server.use(trailingSlashMiddleware({rootConfig}));

      // Add the root.js dev server middlewares.
      server.use(rootDevServerMiddleware(getRenderer));

      // Add any custom plugin 404 handlers.
      plugins.forEach((plugin) => {
        if (plugin.handle404) {
          server.use(plugin.handle404);
        }
      });

      // Add error handlers.
      server.use(rootDevServer404Middleware(getRenderer));
      server.use(rootDevServer500Middleware(getRenderer));
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

  const pods = await collectPods(rootConfig);

  let elementGraph = await getElements(rootConfig, pods);
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
  // Add pod bundle scripts.
  for (const pod of pods) {
    for (const bundleFile of pod.bundleFiles) {
      bundleScripts.push(bundleFile);
    }
  }

  const optimizeDeps = [...elements, ...bundleScripts];
  const viteServer = await createViteServer(rootConfig, {
    port: options.port,
    optimizeDeps: optimizeDeps,
  });

  // Watch for file changes and re-generate the elements graph if any elements
  // are added or deleted, or invalidate cached deps when an element changes.
  const elementsDirPrefixSet = new Set<string>();
  for (const dirPath of getElementsDirs(rootConfig, pods)) {
    for (const candidate of [
      path.resolve(dirPath),
      resolveRealPathSync(dirPath),
    ]) {
      elementsDirPrefixSet.add(
        candidate.endsWith(path.sep) ? candidate : `${candidate}${path.sep}`
      );
    }
  }
  const elementsDirs = Array.from(elementsDirPrefixSet);
  function isInElementsDir(changedFilePath: string) {
    const filePath = path.resolve(changedFilePath);
    return elementsDirs.some((dirPrefix) => filePath.startsWith(dirPrefix));
  }
  viteServer.watcher.on('add', async (filePath: string) => {
    if (isInElementsDir(filePath)) {
      elementGraph = await getElements(rootConfig, pods);
      console.log(`element added: ${filePath}`);
    }
  });
  viteServer.watcher.on('change', (filePath: string) => {
    if (isInElementsDir(filePath)) {
      elementGraph.invalidateFile(filePath);
    }
  });
  viteServer.watcher.on('unlink', async (filePath: string) => {
    if (isInElementsDir(filePath)) {
      elementGraph = await getElements(rootConfig, pods);
      console.log(`element deleted: ${filePath}`);
    }
  });

  const assetMap = new DevServerAssetMap(rootConfig, viteServer.moduleGraph);
  const renderModulePath = path.resolve(__dirname, './render.js');
  const renderModuleId = normalizePath(renderModulePath);

  let cachedRenderModule: RenderModule | null = null;
  let cachedElementGraph: ElementGraph | null = null;
  let cachedRenderer: Renderer | null = null;
  let cachedInvalidationTimestamp = -1;

  /**
   * Lazily loads `render.js` through Vite's SSR loader and returns a cached
   * `Renderer` instance, rebuilding it only when Vite invalidates/reloads the
   * SSR render module or when `elementGraph` changes.
   */
  async function getRenderer(): Promise<Renderer> {
    const ssrGraph = viteServer.environments?.ssr?.moduleGraph;
    const ssrMod = ssrGraph?.getModuleById(renderModuleId);
    if (
      cachedRenderer &&
      elementGraph === cachedElementGraph &&
      ssrMod &&
      ssrMod.transformResult &&
      ssrMod.lastInvalidationTimestamp === cachedInvalidationTimestamp
    ) {
      return cachedRenderer;
    }

    const render = (await viteServer.ssrLoadModule(
      renderModulePath
    )) as RenderModule;
    const updatedSsrMod = ssrGraph?.getModuleById(renderModuleId);
    const invalidationTimestamp =
      updatedSsrMod?.lastInvalidationTimestamp ?? -1;

    if (
      cachedRenderer &&
      render === cachedRenderModule &&
      elementGraph === cachedElementGraph
    ) {
      cachedInvalidationTimestamp = invalidationTimestamp;
      return cachedRenderer;
    }
    cachedRenderModule = render;
    cachedElementGraph = elementGraph;
    cachedInvalidationTimestamp = invalidationTimestamp;
    cachedRenderer = new render.Renderer(rootConfig, {assetMap, elementGraph});
    return cachedRenderer;
  }

  const viteMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Add the viteServer to the req.
    req.viteServer = viteServer;
    // Run the viteServer middlewares to handle vite-specific endpoints.
    viteServer.middlewares(req, res, next);
  };

  return {viteServer, viteMiddleware, getRenderer};
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

  const reloadPublicDirCache = debounce(() => {
    handler = sirv(publicDir, sirvOptions);
  }, 1000);

  function isInPublicDir(changedFilePath: string) {
    const filePath = path.resolve(changedFilePath);
    return filePath.startsWith(publicDir);
  }

  const watcher = options.viteServer.watcher;
  watcher.on('all', (event, filepath) => {
    if (isInPublicDir(filepath)) {
      reloadPublicDirCache();
    }
  });

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next);
  };
}

function rootDevServerMiddleware(getRenderer: () => Promise<Renderer>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const viteServer = req.viteServer!;
    try {
      const renderer = req.renderer || (await getRenderer());
      req.renderer = renderer;
      await renderer.handle(req, res, next);
    } catch (err) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      viteServer.ssrFixStacktrace(err);
      next(err);
    }
  };
}

function rootDevServer404Middleware(getRenderer: () => Promise<Renderer>) {
  return async (req: Request, res: Response) => {
    if (!DEV_SERVER_404_LOG_IGNORE_PATHS.has(req.path)) {
      console.error(`❓ 404 ${req.originalUrl}`);
    }
    const url = req.path;
    const ext = path.extname(url);
    if (!ext) {
      const renderer = req.renderer || (await getRenderer());
      req.renderer = renderer;
      const data = await renderer.renderDevServer404(req);
      const html = data.html || '';
      res.status(404).set({'Content-Type': 'text/html'}).end(html);
      return;
    }
    res.status(404).set({'Content-Type': 'text/plain'}).end('404');
  };
}

function rootDevServer500Middleware(getRenderer: () => Promise<Renderer>) {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`❗ 500 ${req.originalUrl}`);
    console.error(String(err.stack || err));
    const url = req.path;
    const ext = path.extname(url);
    if (!ext) {
      let renderer = req.renderer;
      if (!renderer) {
        try {
          renderer = await getRenderer();
          req.renderer = renderer;
        } catch {
          // If loading the renderer itself failed, fall through to Express's
          // default error handler.
        }
      }
      if (renderer) {
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
