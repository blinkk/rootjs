import fs from 'node:fs';
import path from 'node:path';
import {createServer, ViteDevServer} from 'vite';
import {RootConfig} from '../core/config.js';
import {getVitePlugins} from '../core/plugin.js';

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

  /** Ignore paths from .gitignore when hot reloading. */
  const gitignorePath = path.join(rootDir, '.gitignore');
  let ignored: Array<string | RegExp> = ['**/dist/**'];
  if (fs.existsSync(gitignorePath)) {
    try {
      const contents = fs.readFileSync(gitignorePath, 'utf8');
      const patterns = contents
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((p) => (p.endsWith('/') ? `${p}**` : p));
      ignored = [...ignored, ...patterns];
    } catch {
      /** ignore errors reading gitignore */
    }
  }

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
      watch: {
        ...(viteConfig.server?.watch || {}),
        ignored,
      },
    },
    appType: 'custom',
    optimizeDeps: {
      // As of vite v5 / esbuild v19, experimentalDecorators need to be
      // explicitly set, and for some reason this option isn't read from the
      // project's tsconfig.json file by default.
      // See: https://vitejs.dev/blog/announcing-vite5
      esbuildOptions: {
        tsconfigRaw: {
          compilerOptions: {
            target: 'esnext',
            experimentalDecorators: true,
            useDefineForClassFields: false,
          },
        },
      },
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
