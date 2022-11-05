import {Server} from './types';

type MaybePromise<T> = T | Promise<T>;

export type ConfigureServerHook = (
  server: Server,
  options: ConfigureServerOptions
) => MaybePromise<void> | MaybePromise<() => void>;

export interface ConfigureServerOptions {
  type: 'dev' | 'preview' | 'prod';
}

export interface Plugin {
  name?: string;

  /** Configures the root.js express server . */
  configureServer?: ConfigureServerHook;
}

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
