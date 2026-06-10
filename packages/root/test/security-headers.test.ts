import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, test, expect} from 'vitest';
import {createDevServer} from '../dist/cli.js';

const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

const rootDir = path.resolve(__dirname, './fixtures/security-headers');
const disabledRootDir = path.resolve(
  __dirname,
  './fixtures/security-headers-disabled'
);

let httpServer: http.Server;
let app: any;
const port = 14571;

let disabledHttpServer: http.Server;
let disabledApp: any;
const disabledPort = 14572;

beforeAll(async () => {
  app = await createDevServer({rootDir, port});
  httpServer = app.listen(port);
  disabledApp = await createDevServer({
    rootDir: disabledRootDir,
    port: disabledPort,
  });
  disabledHttpServer = disabledApp.listen(disabledPort);
});

afterAll(async () => {
  for (const server of [httpServer, disabledHttpServer]) {
    if (server) {
      server.close();
    }
  }
  for (const a of [app, disabledApp]) {
    if (a) {
      const viteServer = a.get('viteServer');
      if (viteServer) {
        await viteServer.close();
      }
    }
  }
});

async function fetchPath(
  serverPort: number,
  urlPath: string
): Promise<{status: number; headers: Headers}> {
  const res = await fetch(`http://localhost:${serverPort}${urlPath}`, {
    redirect: 'manual',
  });
  // Drain the body to avoid leaving the connection open.
  await res.text();
  return {status: res.status, headers: res.headers};
}

test('security headers: set on rendered html responses', async () => {
  const {status, headers} = await fetchPath(port, '/');
  expect(status).toBe(200);
  expect(headers.get('strict-transport-security')).toBe(HSTS_VALUE);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
  expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(headers.get('x-xss-protection')).toBe('1; mode=block');
  // CSP (with the per-request nonce) is set by the renderer.
  expect(headers.get('content-security-policy-report-only')).toContain(
    'nonce-'
  );
});

test('security headers: set on `server.redirects` responses', async () => {
  const {status, headers} = await fetchPath(port, '/old-page');
  expect(status).toBe(301);
  expect(headers.get('location')).toBe('/new-page/');
  expect(headers.get('strict-transport-security')).toBe(HSTS_VALUE);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
});

test('security headers: set on trailing slash redirects', async () => {
  const {status, headers} = await fetchPath(port, '/some-page');
  expect(status).toBe(301);
  expect(headers.get('location')).toBe('/some-page/');
  expect(headers.get('strict-transport-security')).toBe(HSTS_VALUE);
});

test('security headers: set on 404 responses', async () => {
  const {status, headers} = await fetchPath(port, '/does-not-exist/');
  expect(status).toBe(404);
  expect(headers.get('strict-transport-security')).toBe(HSTS_VALUE);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
});

test('security headers: CSP is not set on non-rendered responses', async () => {
  const {status, headers} = await fetchPath(port, '/some-page');
  expect(status).toBe(301);
  expect(headers.get('content-security-policy')).toBeNull();
  expect(headers.get('content-security-policy-report-only')).toBeNull();
});

test('security headers: can be disabled via `server.security` config', async () => {
  const html = await fetchPath(disabledPort, '/');
  expect(html.status).toBe(200);
  expect(html.headers.get('strict-transport-security')).toBeNull();
  expect(html.headers.get('x-content-type-options')).toBeNull();
  expect(html.headers.get('x-frame-options')).toBeNull();
  expect(html.headers.get('x-xss-protection')).toBeNull();
  expect(html.headers.get('content-security-policy-report-only')).toBeNull();

  const redirect = await fetchPath(disabledPort, '/some-page');
  expect(redirect.status).toBe(301);
  expect(redirect.headers.get('strict-transport-security')).toBeNull();
});
