import path from 'node:path';
import {createServer, ViteDevServer} from 'vite';
import {getVitePlugins} from '../core/plugin.js';
import {RootConfig} from '../core/config.js';

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
        ...(options?.optimizeDeps || []),
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
      ...(viteConfig.plugins || []),
      ...getVitePlugins(rootConfig.plugins || []),
    ],
  });
  return viteServer;
}

/**
 * Shortcut `viteServer.ssrLoadModule()` without starting an actual dev server.
 */
export async function viteSsrLoadModule(
  rootConfig: RootConfig,
  file: string
): Promise<Record<string, any>> {
  const viteServer = await createViteServer(rootConfig, {hmr: false});
  const module = await viteServer.ssrLoadModule(file);
  await viteServer.close();
  return module;
}