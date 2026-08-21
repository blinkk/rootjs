import {AssetMap} from './asset-map.js';

/**
 * Resolves the CSS deps for components registered via `<StyleDeps src="...">`
 * and adds them to `cssDeps`. Used to inject the CSS of dynamically-imported
 * components, which is not reachable via the route's static import graph.
 *
 * Deduped at two levels: repeated `src` values (e.g. the same template rendered
 * many times in a `PageModules` loop) are resolved once, and `cssDeps` is a Set
 * so each CSS URL is added at most once.
 */
export async function collectStyleDeps(
  assetMap: AssetMap,
  styleDeps: string[],
  cssDeps: Set<string>
): Promise<void> {
  if (!styleDeps || styleDeps.length === 0) {
    return;
  }
  const srcs = Array.from(new Set(styleDeps));
  await Promise.all(
    srcs.map(async (src) => {
      const asset = await assetMap.get(src);
      if (!asset) {
        return;
      }
      const assetCssDeps = await asset.getCssDeps();
      assetCssDeps.forEach((dep) => {
        // Ignore ?inline css deps.
        if (dep.endsWith('?inline')) {
          return;
        }
        cssDeps.add(dep);
      });
    })
  );
}
