import type {Plugin} from 'vite';

export interface PreactToRootJsxPluginOptions {
  /** Whether Root's JSX renderer mode is enabled. */
  useRootJsx?: boolean;
}

/**
 * Vite plugin that aliases `preact` imports to `@blinkk/root/jsx` in the SSR
 * environment only.
 *
 * When `jsxRenderer.mode` is configured, the project uses Root's built-in JSX
 * runtime instead of Preact for server-side rendering. This plugin redirects
 * `preact` imports (`preact`, `preact/hooks`, `preact/jsx-runtime`, etc.) to
 * Root's JSX package, but only in the SSR environment. Client-side code (e.g.
 * islands that depend on real Preact for hydration) is left untouched.
 */
export function preactToRootJsxPlugin(
  options?: PreactToRootJsxPluginOptions
): Plugin {
  const useRootJsx = options?.useRootJsx ?? false;

  /**
   * Preact import specifiers to redirect in SSR when `jsxRenderer.mode` is
   * enabled.
   */
  const SSR_REDIRECTS: Record<string, string> = {
    preact: '@blinkk/root/jsx',
    'preact/hooks': '@blinkk/root/jsx',
    'preact/jsx-runtime': '@blinkk/root/jsx/jsx-runtime',
    'preact/jsx-dev-runtime': '@blinkk/root/jsx/jsx-dev-runtime',
  };

  return {
    name: 'root:preact-to-jsx',
    async resolveId(id, importer, resolveOptions) {
      if (!useRootJsx) {
        return null;
      }

      const ssrTarget = SSR_REDIRECTS[id];
      if (!ssrTarget) {
        return null;
      }

      // Only rewrite in the SSR environment. Client-side code (islands)
      // continues to use the real Preact package.
      const isSSR = this.environment?.name === 'ssr';
      if (!isSSR) {
        return null;
      }

      const resolved = await this.resolve(ssrTarget, importer, {
        ...resolveOptions,
        skipSelf: true,
      });
      return resolved;
    },
  };
}
