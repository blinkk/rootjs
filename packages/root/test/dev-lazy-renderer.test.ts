import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, expect, test, vi} from 'vitest';
import {createDevServer} from '../dist/cli.js';

let tempDir: string;
let httpServer: http.Server;
let app: any;
const port = 14591;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-dev-lazy-renderer-'));
  // Link package node_modules so Vite can resolve preact and @blinkk/root.
  await fs.symlink(
    path.resolve(__dirname, '../node_modules'),
    path.join(tempDir, 'node_modules')
  );
  await fs.mkdir(path.join(tempDir, 'routes'), {recursive: true});
  await fs.mkdir(path.join(tempDir, 'public'), {recursive: true});

  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({name: 'dev-lazy-renderer-test', type: 'module'})
  );
  await fs.writeFile(
    path.join(tempDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        jsx: 'react-jsx',
        jsxImportSource: 'preact',
      },
    })
  );
  const corePath = path.resolve(__dirname, '../dist/core.js');
  await fs.writeFile(
    path.join(tempDir, 'root.config.ts'),
    `import {defineConfig} from ${JSON.stringify(corePath)};\nexport default defineConfig({});\n`
  );
  await fs.writeFile(
    path.join(tempDir, 'public/hello.txt'),
    'hello from public'
  );
  await fs.writeFile(
    path.join(tempDir, 'routes/index.tsx'),
    'export default function Home() {\n  return <html><body><h1>Version 1</h1></body></html>;\n}\n'
  );

  app = await createDevServer({rootDir: tempDir, port});
  httpServer = app.listen(port);
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
  if (tempDir) {
    await fs.rm(tempDir, {recursive: true, force: true});
  }
});

async function fetchPath(
  urlPath: string
): Promise<{status: number; body: string}> {
  const res = await fetch(`http://localhost:${port}${urlPath}`);
  const body = await res.text();
  return {status: res.status, body};
}

test('dev server defers SSR renderer for Vite and public assets, caches it, and invalidates on route HMR', async () => {
  const viteServer = app.get('viteServer');
  const ssrLoadSpy = vi.spyOn(viteServer, 'ssrLoadModule');

  // Vite client assets and public/ files must not trigger ssrLoadModule().
  const viteClient = await fetchPath('/@vite/client');
  expect(viteClient.status).toBe(200);
  const publicAsset = await fetchPath('/hello.txt');
  expect(publicAsset.status).toBe(200);
  expect(publicAsset.body).toBe('hello from public');
  expect(ssrLoadSpy).toHaveBeenCalledTimes(0);

  // Concurrent cold-start HTML requests coalesce into a single ssrLoadModule().
  const concurrentResults = await Promise.all([
    fetchPath('/'),
    fetchPath('/'),
    fetchPath('/'),
    fetchPath('/'),
    fetchPath('/'),
  ]);
  for (const result of concurrentResults) {
    expect(result.status).toBe(200);
    expect(result.body).toContain('<h1>Version 1</h1>');
  }
  expect(ssrLoadSpy).toHaveBeenCalledTimes(1);

  // Subsequent warm HTML requests reuse the cached Renderer without reloading.
  const secondHtml = await fetchPath('/');
  expect(secondHtml.status).toBe(200);
  expect(secondHtml.body).toContain('<h1>Version 1</h1>');
  expect(ssrLoadSpy).toHaveBeenCalledTimes(1);

  // Editing a route file invalidates the SSR module and updates rendered HTML.
  await fs.writeFile(
    path.join(tempDir, 'routes/index.tsx'),
    'export default function Home() {\n  return <html><body><h1>Version 2</h1></body></html>;\n}\n'
  );
  // Wait for Vite's file watcher to propagate SSR module invalidation.
  let updatedBody = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await fetchPath('/');
    updatedBody = res.body;
    if (updatedBody.includes('<h1>Version 2</h1>')) {
      break;
    }
  }
  expect(updatedBody).toContain('<h1>Version 2</h1>');
  expect(ssrLoadSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

  // Missing HTML route still renders the dev 404 page.
  const missingHtml = await fetchPath('/does-not-exist');
  expect(missingHtml.status).toBe(404);
  expect(missingHtml.body).toContain('404');

  // Missing file with extension returns plain 404.
  const missingAsset = await fetchPath('/missing.png');
  expect(missingAsset.status).toBe(404);
  expect(missingAsset.body).toBe('404');
});

test('dev server exposes req.renderer to plugin.configureServer and server.middlewares while skipping Vite assets', async () => {
  const customDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'root-dev-lazy-renderer-custom-')
  );
  const customPort = 14593;
  let customApp: any;
  let customHttpServer: http.Server | undefined;

  try {
    await fs.symlink(
      path.resolve(__dirname, '../node_modules'),
      path.join(customDir, 'node_modules')
    );
    await fs.mkdir(path.join(customDir, 'routes'), {recursive: true});
    await fs.writeFile(
      path.join(customDir, 'package.json'),
      JSON.stringify({name: 'dev-lazy-renderer-custom-test', type: 'module'})
    );
    await fs.writeFile(
      path.join(customDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'preact',
        },
      })
    );
    const corePath = path.resolve(__dirname, '../dist/core.js');
    await fs.writeFile(
      path.join(customDir, 'root.config.ts'),
      `import {defineConfig} from ${JSON.stringify(corePath)};
export default defineConfig({
  plugins: [
    {
      name: 'custom-plugin',
      configureServer(server) {
        server.use((req, res, next) => {
          if (req.path === '/plugin-check') {
            const [route] = req.renderer ? req.renderer.getRoute('/') : [];
            res.status(200).send(route ? 'plugin-has-renderer' : 'missing');
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    middlewares: [
      (req, res, next) => {
        if (req.path === '/middleware-check') {
          const [route] = req.renderer ? req.renderer.getRoute('/') : [];
          res.status(200).send(route ? 'middleware-has-renderer' : 'missing');
          return;
        }
        next();
      },
    ],
  },
});
`
    );
    await fs.writeFile(
      path.join(customDir, 'routes/index.tsx'),
      'export default function Home() {\n  return <html><body><h1>Home</h1></body></html>;\n}\n'
    );

    customApp = await createDevServer({rootDir: customDir, port: customPort});
    customHttpServer = customApp.listen(customPort);
    const viteServer = customApp.get('viteServer');
    const ssrLoadSpy = vi.spyOn(viteServer, 'ssrLoadModule');

    // Vite client assets still never trigger ssrLoadModule().
    const viteRes = await fetch(`http://localhost:${customPort}/@vite/client`);
    expect(viteRes.status).toBe(200);
    expect(ssrLoadSpy).toHaveBeenCalledTimes(0);

    // Cold-start request to plugin.configureServer middleware gets req.renderer.
    const pluginRes = await fetch(
      `http://localhost:${customPort}/plugin-check`
    );
    expect(pluginRes.status).toBe(200);
    expect(await pluginRes.text()).toBe('plugin-has-renderer');
    expect(ssrLoadSpy).toHaveBeenCalledTimes(1);

    // Request to server.middlewares gets the cached req.renderer.
    const mwRes = await fetch(
      `http://localhost:${customPort}/middleware-check`
    );
    expect(mwRes.status).toBe(200);
    expect(await mwRes.text()).toBe('middleware-has-renderer');
    expect(ssrLoadSpy).toHaveBeenCalledTimes(1);
  } finally {
    if (customHttpServer) {
      customHttpServer.close();
    }
    if (customApp) {
      const viteServer = customApp.get('viteServer');
      if (viteServer) {
        await viteServer.close();
      }
    }
    await fs.rm(customDir, {recursive: true, force: true});
  }
});
