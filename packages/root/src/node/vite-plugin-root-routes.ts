import {Plugin} from 'vite';
import {RootConfig} from '../core/config.js';

/**
 * Vite plugin that provides a virtual module for plugin-defined routes.
 *
 * This plugin creates a virtual module `virtual:root-plugin-routes` that exports
 * a map of route paths to their corresponding modules. Plugins can define routes
 * via the `routes` property in their plugin configuration.
 *
 * @example
 * ```ts
 * // In a plugin:
 * export function myPlugin(): Plugin {
 *   return {
 *     name: 'my-plugin',
 *     routes: {
 *       '/my-route': path.resolve(__dirname, 'my-route.tsx'),
 *     },
 *   };
 * }
 * ```
 */
export function pluginRootRoutes(rootConfig: RootConfig): Plugin {
  // Virtual module ID following Vite's convention for virtual modules.
  const virtualModuleId = 'virtual:root-plugin-routes';
  // The \0 prefix is a Rollup convention to prevent other plugins from resolving it.
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'root-plugin-routes',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        // Collect routes from all plugins into a single map.
        const routes: Record<string, string> = {};
        const plugins = rootConfig.plugins || [];
        plugins.forEach((plugin) => {
          if (plugin.routes) {
            Object.assign(routes, plugin.routes);
          }
        });

        // Generate import statements and exports for each route.
        const imports: string[] = [];
        const exports: string[] = [];
        let i = 0;
        Object.entries(routes).forEach(([routePath, filePath]) => {
          const varName = `route_${i++}`;
          // Normalize path separators for cross-platform compatibility.
          const importPath = filePath.replaceAll('\\', '/');
          imports.push(`import * as ${varName} from '${importPath}';`);
          exports.push(
            `'${routePath}': {module: ${varName}, src: '${importPath}'},`
          );
        });

        return `
          ${imports.join('\n')}
          export default {
            ${exports.join('\n')}
          };
        `;
      }
      return null;
    },
  };
}
