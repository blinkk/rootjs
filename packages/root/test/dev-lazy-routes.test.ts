import fs from 'node:fs/promises';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
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

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
}

test('dev mode handles live HMR edits, syntax error recovery, and adding config.locales on lazy routes', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-lazy-hmr-'));
  let tmpHttpServer: http.Server | undefined;
  let tmpApp: any;
  try {
    await fs.symlink(
      path.resolve(__dirname, '../node_modules'),
      path.join(tmpDir, 'node_modules')
    );
    await fs.mkdir(path.join(tmpDir, 'routes'), {recursive: true});
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'lazy-hmr-test', type: 'module'})
    );
    await fs.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'preact',
        },
      })
    );
    await fs.writeFile(
      path.join(tmpDir, 'root.config.ts'),
      `export default {
  i18n: {
    locales: ['en', 'fr', 'de'],
    urlFormat: '/intl/[locale]/[path]',
  },
  vite: {
    server: {
      hmr: {port: 0},
    },
  },
};
`
    );

    const routeFile = path.join(tmpDir, 'routes/foo.tsx');
    await fs.writeFile(
      routeFile,
      `export default function FooPage() {
  return <h1>Foo v1</h1>;
}
`
    );
    const multiConfigRouteFile = path.join(tmpDir, 'routes/multi.tsx');
    await fs.writeFile(
      multiConfigRouteFile,
      `export const a = 1, config = {locales: ['de']};
export default function MultiPage() {
  return <h1>Multi</h1>;
}
`
    );
    const errorRouteFile = path.join(tmpDir, 'routes/500.tsx');
    await fs.writeFile(
      errorRouteFile,
      `export default function Custom500(props: {error?: Error}) {
  return <h1>Custom 500: {props.error?.message}</h1>;
}
`
    );
    const concurrentRouteFile = path.join(tmpDir, 'routes/concurrent.tsx');
    await fs.writeFile(
      concurrentRouteFile,
      `export default function ConcurrentPage() {
  return <h1>Concurrent OK</h1>;
}
`
    );

    tmpApp = await createDevServer({rootDir: tmpDir, port: 0});
    let tmpPort = 0;
    await new Promise<void>((resolve) => {
      tmpHttpServer = tmpApp.listen(0, () => {
        tmpPort = (tmpHttpServer!.address() as AddressInfo).port;
        resolve();
      });
    });

    const viteServer = tmpApp.get('viteServer');
    const writeAndWaitForChange = async (content: string) => {
      // Wait for chokidar to observe the file change before fetching.
      const changed = new Promise<void>((resolve) => {
        const onChange = (changedPath: string) => {
          if (path.resolve(changedPath) === path.resolve(routeFile)) {
            viteServer.watcher.off('change', onChange);
            resolve();
          }
        };
        viteServer.watcher.on('change', onChange);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.writeFile(routeFile, content);
      await changed;
    };

    const fetchTmp = async (urlPath: string) => {
      const res = await fetch(`http://localhost:${tmpPort}${urlPath}`);
      return {status: res.status, body: await res.text()};
    };

    // Initial render of lazy route.
    const r1 = await fetchTmp('/foo');
    expect(r1.status).toBe(200);
    expect(r1.body).toContain('Foo v1');
    expect((await fetchTmp('/intl/fr/foo')).status).toBe(200);

    // (a) Live HMR edit to the lazy route file on disk.
    await writeAndWaitForChange(
      `export default function FooPage() {
  return <h1>Foo v2</h1>;
}
`
    );
    await waitFor(async () => {
      const r = await fetchTmp('/foo');
      return r.status === 200 && r.body.includes('Foo v2');
    });

    // (b) Syntax error -> 500 -> fix -> 200 recovery on the lazy route.
    await writeAndWaitForChange(
      `export default function FooPage( {
  return <h1>Broken</h1>;
}
`
    );
    await waitFor(async () => {
      const r = await fetchTmp('/foo');
      return r.status === 500;
    });

    await writeAndWaitForChange(
      `export default function FooPage() {
  return <h1>Foo recovered</h1>;
}
`
    );
    await waitFor(async () => {
      const r = await fetchTmp('/foo');
      return r.status === 200 && r.body.includes('Foo recovered');
    });

    // (c) Adding `export const config = {locales: ['de']}` to an existing lazy
    // route during `root dev` hard-invalidates `virtual:root/routes`.
    await writeAndWaitForChange(
      `export const config = {locales: ['de']};
export default function FooPage() {
  return <h1>Foo de only</h1>;
}
`
    );
    await waitFor(async () => {
      const frRes = await fetchTmp('/intl/fr/foo');
      return frRes.status === 404;
    });
    const deRes = await fetchTmp('/intl/de/foo');
    expect(deRes.status).toBe(200);
    expect(deRes.body).toContain('Foo de only');
    expect((await fetchTmp('/intl/en/foo')).status).toBe(404);

    // (d) Multi-declarator `export const a = 1, config = {locales: ['de']}` is
    // detected as eager by AST parsing.
    const multiDeRes = await fetchTmp('/intl/de/multi');
    expect(multiDeRes.status).toBe(200);
    expect(multiDeRes.body).toContain('Multi');
    expect((await fetchTmp('/intl/fr/multi')).status).toBe(404);

    // (e) Concurrent cold requests sharing a single `Renderer` instance and
    // lazy `routes/500.tsx` rendering via `renderError()`.
    const renderMod = await viteServer.ssrLoadModule(
      path.resolve(__dirname, '../dist/render.js')
    );
    expect(typeof renderMod.ensureRouteModule).toBe('function');
    const sharedRenderer = new renderMod.Renderer(tmpApp.get('rootConfig'), {
      assetMap: {get: () => null},
      elementGraph: {sourceFiles: {}, getDeps: () => []},
    });
    const [sharedRoute] = sharedRenderer.getRoute('/concurrent');
    expect(typeof sharedRoute.loadModule).toBe('function');
    const concurrentResults = await Promise.all(
      Array.from({length: 8}, () =>
        sharedRenderer.renderRoute(sharedRoute, {routeParams: {}})
      )
    );
    for (const result of concurrentResults) {
      expect(result.html).toContain('Concurrent OK');
    }

    const [errorRoute] = sharedRenderer.getRoute('/500');
    expect(typeof errorRoute.loadModule).toBe('function');
    const errorResult = await sharedRenderer.renderError(new Error('boom'));
    expect(errorResult.html).toContain('Custom 500: boom');
  } finally {
    if (tmpHttpServer) {
      tmpHttpServer.close();
    }
    if (tmpApp) {
      const viteServer = tmpApp.get('viteServer');
      if (viteServer) {
        await viteServer.close();
      }
    }
    await fs.rm(tmpDir, {recursive: true, force: true});
  }
});
