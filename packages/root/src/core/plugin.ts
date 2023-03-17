import {PluginOption as VitePlugin} from 'vite';
import {RootConfig} from './config';
import {Server} from './types';

type MaybePromise<T> = T | Promise<T>;

export type ConfigureServerHook = (
  server: Server,
  options: ConfigureServerOptions
) => MaybePromise<void> | MaybePromise<() => void>;

export interface ConfigureServerOptions {
  type: 'dev' | 'preview' | 'prod';
  rootConfig: RootConfig;
}

export interface Plugin {
  [key: string]: any;
  /** The name of the plugin. */
  name?: string;
  /**
   * Configures the root.js express server. Any middleware defined by the plugin
   * will be added to the server first. If a callback fn is returned, it will
   * be called after the root.js middlewares are added.
   */
  configureServer?: ConfigureServerHook;
  /**
   * Returns a list of deps to bundle for ssr. The files will be bundled and
   * output to `dist/server/`. The return value should be a map of
   * `{output filename => input filepath}`.
   *
   * E.g. a value of `{foo: 'path/to/bar.js'}` will output `dist/server/foo.js`.
   *
   * @experimental This config is subject to change to be incorporated into a
   * broader config option called "ssr" or "ssrOptions".
   */
  ssrInput?: () => {[entryAlias: string]: string};
  /** Adds vite plugins. */
  vitePlugins?: VitePlugin[];
}

/**
 * Runs the pre-hook configureServer method of every plugin, calls a callback
 * function, and then runs the configureServer's post-hook if provided. Plugins
 * provide a post-hook by returning a callback function from configureServer.
 */
export async function configureServerPlugins(
  server: Server,
  callback: () => Promise<void>,
  plugins: Plugin[],
  options: ConfigureServerOptions
) {
  const postHooks: Array<() => void> = [];

  // Call the `configureServer()` method for each plugin.
  for (const plugin of plugins) {
    if (plugin.configureServer) {
      const postHook = await plugin.configureServer(server, options);
      if (postHook) {
        postHooks.push(postHook);
      }
    }
  }

  // Register any built-in middleware.
  callback();

  // Run any post hooks returned by `plugin.configureServer()`.
  for (const postHook of postHooks) {
    await postHook();
  }
}

export function getVitePlugins(plugins: Plugin[]): VitePlugin[] {
  const vitePlugins: VitePlugin[] = [];
  for (const plugin of plugins) {
    if (plugin.vitePlugins) {
      vitePlugins.push(...plugin.vitePlugins);
    }
  }
  return vitePlugins;
}
