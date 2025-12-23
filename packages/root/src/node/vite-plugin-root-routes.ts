import {Plugin} from 'vite';
import {RootConfig} from '../core/config.js';

export function pluginRootRoutes(rootConfig: RootConfig): Plugin {
  const virtualModuleId = 'virtual:root-plugin-routes';
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
        const routes: Record<string, string> = {};
        const plugins = rootConfig.plugins || [];
        plugins.forEach((plugin) => {
          if (plugin.routes) {
            Object.assign(routes, plugin.routes);
          }
        });

        const imports: string[] = [];
        const exports: string[] = [];
        let i = 0;
        Object.entries(routes).forEach(([routePath, filePath]) => {
          const varName = `route_${i++}`;
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
