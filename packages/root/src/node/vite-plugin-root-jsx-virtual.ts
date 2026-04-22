import type {Plugin} from 'vite';

export interface RootJsxVirtualPluginOptions {
  /** Whether Root's JSX renderer mode is enabled. */
  useRootJsx?: boolean;
}

/**
 * Vite plugin that provides virtual modules for environment-aware JSX imports.
 *
 * Framework-internal code imports from `virtual:root-jsx` or
 * `virtual:root-jsx/hooks` instead of `preact` directly. This plugin resolves
 * those virtual modules to the appropriate implementation based on the
 * current Vite environment:
 *
 * - **SSR** with `jsxRenderer.mode` enabled: resolves to `@blinkk/root/jsx`.
 * - **Client** (or SSR without `jsxRenderer.mode`): resolves to `preact`.
 *
 * Direct imports of `preact` or `@blinkk/root/jsx` by user code are left
 * untouched, so client-side island code that depends on real Preact continues
 * to work.
 *
 * The plugin also redirects the compiler-generated `preact/jsx-runtime` and
 * `preact/jsx-dev-runtime` imports in SSR when `jsxRenderer.mode` is enabled,
 * since those imports are produced by the JSX transform and cannot use virtual
 * module specifiers.
 */
export function rootJsxVirtualPlugin(
  options?: RootJsxVirtualPluginOptions
): Plugin {
  const useRootJsx = options?.useRootJsx ?? false;

  /** Virtual module id → SSR / client resolution targets. */
  const VIRTUAL_MODULES: Record<string, {ssr: string; client: string}> = {
    'virtual:root-jsx': {
      ssr: '@blinkk/root/jsx',
      client: 'preact',
    },
    'virtual:root-jsx/hooks': {
      ssr: '@blinkk/root/jsx',
      client: 'preact/hooks',
    },
  };

  /**
   * Compiler-generated JSX runtime imports that need environment-aware
   * resolution. These cannot use virtual module specifiers because they are
   * emitted by the JSX transform (e.g. tsup with `jsxImportSource: "preact"`).
   */
  const JSX_RUNTIME_REDIRECTS: Record<string, string> = {
    'preact/jsx-runtime': '@blinkk/root/jsx/jsx-runtime',
    'preact/jsx-dev-runtime': '@blinkk/root/jsx/jsx-dev-runtime',
  };

  return {
    name: 'root:jsx-virtual',
    async resolveId(id, importer, resolveOptions) {
      // Handle virtual modules.
      const virtualMapping = VIRTUAL_MODULES[id];
      if (virtualMapping) {
        const isSSR = this.environment?.name === 'ssr';
        const target =
          isSSR && useRootJsx ? virtualMapping.ssr : virtualMapping.client;
        const resolved = await this.resolve(target, importer, {
          ...resolveOptions,
          skipSelf: true,
        });
        return resolved;
      }

      // Handle compiler-generated JSX runtime imports (SSR only).
      if (useRootJsx) {
        const ssrTarget = JSX_RUNTIME_REDIRECTS[id];
        if (ssrTarget) {
          const isSSR = this.environment?.name === 'ssr';
          if (isSSR) {
            const resolved = await this.resolve(ssrTarget, importer, {
              ...resolveOptions,
              skipSelf: true,
            });
            return resolved;
          }
        }
      }

      return null;
    },
  };
}
