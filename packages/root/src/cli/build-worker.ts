import path from 'node:path';
import {parentPort, workerData} from 'node:worker_threads';

import {Route} from '../core/types.js';
import {ElementGraph} from '../node/element-graph.js';
import {loadBundledConfig} from '../node/load-config.js';
import {
  BuildAssetManifest,
  BuildAssetMap,
} from '../render/asset-map/build-asset-map.js';
import {loadJson} from '../utils/fsutils.js';
import {
  buildPage,
  BuildPageTask,
  BuildWorkerRequest,
  BuildWorkerResponse,
} from './build-page.js';

type RenderModule = typeof import('../render/render.js');

export interface BuildWorkerData {
  rootDir: string;
  mode: string;
}

async function main() {
  if (!parentPort) {
    throw new Error('build-worker.js must be run as a worker thread');
  }
  const port = parentPort;
  const {rootDir, mode} = workerData as BuildWorkerData;
  process.env.NODE_ENV = mode;

  const rootConfig = await loadBundledConfig(rootDir, {command: 'build'});
  const distDir = path.join(rootDir, 'dist');
  const buildDir = path.join(distDir, 'html');

  // Load the site's pre-built server bundle and asset manifests, mirroring
  // the prod server (`root start`) bootstrapping.
  const render: RenderModule = await import(
    path.join(distDir, 'server/render.js')
  );
  const rootManifest = await loadJson<BuildAssetManifest>(
    path.join(distDir, '.root/manifest.json')
  );
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, rootManifest);
  const elementGraphJson = await loadJson<any>(
    path.join(distDir, '.root/elements.json')
  );
  const elementGraph = ElementGraph.fromJson(elementGraphJson);
  const renderer = new render.Renderer(rootConfig, {assetMap, elementGraph});

  // Build a map of routes keyed by src + locale. The main thread's sitemap
  // identifies each page's route by its src file and locale, which uniquely
  // identifies a route registered with the router. (Url matching is not used
  // here since some routes, e.g. `[slug].json.ts`, are not resolvable from
  // their generated url paths.)
  const routesByKey = new Map<string, Route>();
  const routeKey = (src: string, locale: string, isDefaultLocale: boolean) => {
    return `${src}|${isDefaultLocale ? 'x-default' : locale}`;
  };
  await renderer.walkRoutes(async (_urlPathFormat: string, route: Route) => {
    routesByKey.set(
      routeKey(route.src, route.locale, route.isDefaultLocale),
      route
    );
  });

  /**
   * Resolves the route for a task using the route src and locale provided by
   * the main thread's sitemap. Falls back to url matching.
   */
  function findRoute(task: BuildPageTask): Route | undefined {
    if (task.routeSrc && task.locale) {
      const route = routesByKey.get(
        routeKey(task.routeSrc, task.locale, task.locale === 'x-default')
      );
      if (route) {
        return route;
      }
    }
    const matches = renderer.getRouteMatches(task.urlPath);
    for (const [route] of matches) {
      if (!task.routeSrc || route.src === task.routeSrc) {
        return route;
      }
    }
    return undefined;
  }

  port.on('message', async (msg: BuildWorkerRequest) => {
    if (msg.type !== 'render') {
      return;
    }
    const task = msg.task;
    try {
      const route = findRoute(task);
      if (!route) {
        throw new Error(`could not find route for ${task.urlPath}`);
      }
      const result = await buildPage(
        renderer,
        rootConfig,
        buildDir,
        route,
        task
      );
      const res: BuildWorkerResponse = {type: 'result', id: msg.id, result};
      port.postMessage(res);
    } catch (e: any) {
      const res: BuildWorkerResponse = {
        type: 'error',
        id: msg.id,
        urlPath: task.urlPath,
        params: task.params,
        routeSrc: task.routeSrc,
        error: String(e?.stack || e),
      };
      port.postMessage(res);
    }
  });

  const readyRes: BuildWorkerResponse = {type: 'ready'};
  port.postMessage(readyRes);
}

main().catch((e) => {
  const res: BuildWorkerResponse = {
    type: 'fatal',
    error: String(e?.stack || e),
  };
  if (parentPort) {
    parentPort.postMessage(res);
  } else {
    console.error(res.error);
    process.exit(1);
  }
});
