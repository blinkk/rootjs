import {createServer, ViteDevServer} from 'vite';
import type {Plugin, EnvironmentModuleNode} from 'vite';
import {RootConfig} from '../core/config.js';
import {getVitePlugins} from '../core/plugin.js';
import {rootPodsVitePlugin} from './pods-vite-plugin.js';
import {preactToRootJsxPlugin} from './vite-plugin-root-jsx-virtual.js';

export interface CreateViteServerOptions {
  /** Override HMR settings. */
  hmr?: boolean;
  /** The port the server will run on. */
  port?: number;
  /** List of files to include in the optimizeDeps.include config. */
  optimizeDeps?: string[];
}

/**
 * Returns a vite dev server.
 */
export async function createViteServer(
  rootConfig: RootConfig,
  options?: CreateViteServerOptions
): Promise<ViteDevServer> {
  const rootDir = rootConfig.rootDir;
  const viteConfig = rootConfig.vite || {};

  let hmrOptions = viteConfig.server?.hmr;
  if (options?.hmr === false) {
    hmrOptions = false;
  } else if (typeof hmrOptions === 'undefined' && options?.port) {
    // Automatically set the HMR port to `port + 10`. This allows multiple
    // root.js dev servers to run without conflicts.
    hmrOptions = {port: options.port + 10};
  }

  const viteServer = await createServer({
    ...viteConfig,
    mode: 'development',
    root: rootDir,
    // publicDir is disabled from the vite dev server since it's handled by the
    // root dev server directly, which allows user middlewares to override
    // files in the public dir.
    publicDir: false,
    server: {
      ...(viteConfig.server || {}),
      middlewareMode: true,
      hmr: hmrOptions,
    },
    appType: 'custom',
    optimizeDeps: {
      ...(viteConfig.optimizeDeps || {}),
      include: [
        ...(options?.optimizeDeps || []),
        ...(viteConfig.optimizeDeps?.include || []),
      ],
      extensions: [...(viteConfig.optimizeDeps?.extensions || []), '.tsx'],
    },
    ssr: {
      ...(viteConfig.ssr || {}),
      noExternal: ['@blinkk/root', '@blinkk/root-cms/richtext'],
    },
    plugins: [
      rootPodsVitePlugin(rootConfig),
      hmrSSRReload(),
      preactToRootJsxPlugin({useRootJsx: !!rootConfig.jsxRenderer?.mode}),
      ...(viteConfig.plugins || []),
      ...getVitePlugins(rootConfig.plugins || []),
    ],
  });
  return viteServer;
}

/**
 * Shortcut `viteServer.ssrLoadModule()` without starting an actual dev server.
 */
export async function viteSsrLoadModule<T = Record<string, any>>(
  rootConfig: RootConfig,
  file: string
): Promise<T> {
  const viteServer = await createViteServer(rootConfig, {hmr: false});
  const module = await viteServer.ssrLoadModule(file);
  await viteServer.close();
  return module as T;
}

/**
 * Vite plugin to reload the page when SSR modules change.
 * https://github.com/vitejs/vite/issues/19114
 */
function hmrSSRReload(): Plugin {
  return {
    name: 'hmr-ssr-reload',
    enforce: 'post',
    hotUpdate: {
      order: 'post',
      handler({modules, server, timestamp}) {
        if (this.environment.name !== 'ssr') {
          return;
        }

        let hasSsrOnlyModules = false;
        const invalidatedModules = new Set<EnvironmentModuleNode>();
        for (const mod of modules) {
          if (mod.id === null) {
            continue;
          }
          const clientModule =
            server.environments.client.moduleGraph.getModuleById(mod.id);
          if (clientModule) {
            continue;
          }

          hasSsrOnlyModules = true;
          this.environment.moduleGraph.invalidateModule(
            mod,
            invalidatedModules,
            timestamp,
            true
          );
        }

        if (hasSsrOnlyModules) {
          server.ws.send({type: 'full-reload'});
          return [];
        }

        return;
      },
    },
  };
}
