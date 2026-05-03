import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, test, expect} from 'vitest';
import {createDevServer} from '../dist/cli.js';

const rootDir = path.resolve(__dirname, './fixtures/pods-ssr');
let httpServer: http.Server;
let app: any;
const port = 14567;

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

async function fetchPath(urlPath: string): Promise<{status: number; body: string}> {
  const res = await fetch(`http://localhost:${port}${urlPath}`);
  const body = await res.text();
  return {status: res.status, body};
}

test('ssr: user route renders correctly', async () => {
  const {status, body} = await fetchPath('/');
  expect(status).toBe(200);
  expect(body).toContain('<h1>User Home</h1>');
});

test('ssr: pod route renders correctly', async () => {
  const {status, body} = await fetchPath('/from-pod/hello');
  expect(status).toBe(200);
  expect(body).toContain('<h1>Hello from pod</h1>');
});
