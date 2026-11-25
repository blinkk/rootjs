import http from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {afterAll, beforeAll, expect, test} from 'vitest';
import {createDevServer} from '../dist/cli.js';

const rootDir = path.resolve(__dirname, './fixtures/i18n-route-locales');
let httpServer: http.Server;
let app: any;
let port: number;

beforeAll(async () => {
  app = await createDevServer({rootDir});
  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(async () => {
  if (httpServer) {
    httpServer.close();
  }
  if (app) {
    const viteServer = app.get('viteServer');
    if (viteServer) {
      await viteServer.close();
    }
  }
});

async function fetchPath(
  urlPath: string
): Promise<{status: number; body: string}> {
  const res = await fetch(`http://localhost:${port}${urlPath}`);
  const body = await res.text();
  return {status: res.status, body};
}

function isSsrTransformed(filePath: string): boolean {
  const viteServer = app.get('viteServer');
  const mods = viteServer.environments.ssr.moduleGraph.getModulesByFile(
    path.resolve(filePath)
  );
  if (!mods || mods.size === 0) {
    return false;
  }
  return Array.from(mods).some((mod: any) => Boolean(mod.transformResult));
}

test('dev mode lazily loads routes on demand while preserving route config.locales', async () => {
  const indexRouteFile = path.join(rootDir, 'routes/index.tsx');
  const limitedRouteFile = path.join(rootDir, 'routes/limited.tsx');

  // Requesting `/limited` (which exports `config.locales`) should render it
  // without transforming the unvisited lazy `routes/index.tsx` module.
  const limitedRes = await fetchPath('/limited');
  expect(limitedRes.status).toBe(200);
  expect(limitedRes.body).toContain('Current locale: en');
  expect(isSsrTransformed(limitedRouteFile)).toBe(true);
  expect(isSsrTransformed(indexRouteFile)).toBe(false);

  // Per-route `config.locales: ['fr']` should still be respected in dev mode.
  const limitedFrRes = await fetchPath('/intl/fr/limited');
  expect(limitedFrRes.status).toBe(200);
  expect(limitedFrRes.body).toContain('Current locale: fr');
  expect(isSsrTransformed(indexRouteFile)).toBe(false);

  // Visiting `/` loads `routes/index.tsx` on demand.
  const indexRes = await fetchPath('/');
  expect(indexRes.status).toBe(200);
  expect(indexRes.body).toContain('Current locale: en');
  expect(isSsrTransformed(indexRouteFile)).toBe(true);

  // Lazy routes still use the site-wide `i18n.locales`.
  const indexDeRes = await fetchPath('/intl/de/');
  expect(indexDeRes.status).toBe(200);
  expect(indexDeRes.body).toContain('Current locale: de');

  // Locales excluded by `config.locales` return 404.
  const limitedEnRes = await fetchPath('/intl/en/limited');
  expect(limitedEnRes.status).toBe(404);
  const limitedDeRes = await fetchPath('/intl/de/limited');
  expect(limitedDeRes.status).toBe(404);
});

test('lazy route loader is retained for HMR updates across reused Route instances', async () => {
  const viteServer = app.get('viteServer');
  const renderMod = await viteServer.ssrLoadModule(
    path.resolve(__dirname, '../dist/render.js')
  );
  const rootConfig = app.get('rootConfig');
  const renderer = new renderMod.Renderer(rootConfig, {
    assetMap: {get: () => null},
    elementGraph: {sourceFiles: {}, getDeps: () => []},
  });

  const [route] = renderer.getRoute('/');
  expect(route).toBeDefined();
  expect(typeof route.loadModule).toBe('function');

  let version = 1;
  route.loadModule = async () => ({
    default: () => `v${version}`,
  });

  const res1 = await renderer.renderRoute(route, {routeParams: {}});
  expect(res1.html).toContain('v1');
  expect(typeof route.loadModule).toBe('function');

  version = 2;
  const res2 = await renderer.renderRoute(route, {routeParams: {}});
  expect(res2.html).toContain('v2');
});
