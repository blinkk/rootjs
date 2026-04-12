import type {Plugin} from 'vite';

/**
 * Vite plugin that aliases `preact` imports to `@blinkk/root/jsx`.
 *
 * When `jsxRenderer.mode` is configured, the project uses Root's built-in JSX
 * runtime instead of Preact. This plugin redirects all `preact` imports
 * (including `preact/hooks`, `preact/jsx-runtime`, etc.) so that Root's
 * built-in hooks and components use Root's context API rather than Preact's.
 */
export function preactToRootJsxPlugin(): Plugin {
  return {
    name: 'root:preact-to-jsx',
    config() {
      return {
        resolve: {
          alias: [
            {find: /^preact\/hooks$/, replacement: '@blinkk/root/jsx'},
            {
              find: /^preact\/jsx-runtime$/,
              replacement: '@blinkk/root/jsx/jsx-runtime',
            },
            {
              find: /^preact\/jsx-dev-runtime$/,
              replacement: '@blinkk/root/jsx/jsx-dev-runtime',
            },
            {find: /^preact$/, replacement: '@blinkk/root/jsx'},
          ],
        },
      };
    },
  };
}
