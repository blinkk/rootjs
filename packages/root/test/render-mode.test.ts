import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, test, expect} from 'vitest';
import {createDevServer} from '../dist/cli.js';

const rootDir = path.resolve(__dirname, './fixtures/render-mode');
let httpServer: http.Server;
let app: any;
const port = 14568;

beforeAll(async () => {
  app = await createDevServer({rootDir, port});
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
});

async function fetchPath(
  urlPath: string
): Promise<{status: number; body: string}> {
  const res = await fetch(`http://localhost:${port}${urlPath}`);
  const body = await res.text();
  return {status: res.status, body};
}

test('ssr: defaults to the render mode from root.config.ts', async () => {
  const {status, body} = await fetchPath('/');
  expect(status).toBe(200);
  // The config sets `mode: 'pretty'`, so block elements render on their own
  // line with surrounding newlines.
  expect(body).toContain('<main>\n<h1>Default Mode</h1>\n</main>');
});

test('ssr: render() can override the render mode', async () => {
  const {status, body} = await fetchPath('/minimal');
  expect(status).toBe(200);
  // The route's `handle()` passes `{renderMode: 'minimal'}`, overriding the
  // `'pretty'` default, so the output is compact with no extra whitespace.
  expect(body).toContain('<main><h1>Minimal Mode</h1></main>');
});
