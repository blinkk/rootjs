import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {createDevServer} from '../dist/cli.js';
import {getContentType} from '../src/utils/mime.js';

describe('getContentType', () => {
  test('returns a javascript mime type for .js and .mjs', () => {
    expect(getContentType('.js')).toBe('application/javascript');
    expect(getContentType('js')).toBe('application/javascript');
    expect(getContentType('.mjs')).toBe('application/javascript');
  });

  test('returns the correct mime type for other known extensions', () => {
    expect(getContentType('.css')).toBe('text/css');
    expect(getContentType('.html')).toBe('text/html');
    expect(getContentType('.json')).toBe('application/json');
  });

  test('returns the fallback for unknown extensions', () => {
    expect(getContentType('.xyz')).toBe('application/octet-stream');
    expect(getContentType('.xyz', 'text/plain')).toBe('text/plain');
  });
});

describe('dev server 404 content type', () => {
  const rootDir = path.resolve(__dirname, './fixtures/minimal');
  let httpServer: http.Server;
  let app: any;
  const port = 14593;

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

  async function fetchContentType(
    urlPath: string
  ): Promise<{status: number; contentType: string}> {
    const res = await fetch(`http://localhost:${port}${urlPath}`);
    await res.text();
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
    };
  }

  test('missing js module returns a javascript mime type', async () => {
    const {status, contentType} = await fetchContentType(
      '/assets/does-not-exist.min.js'
    );
    expect(status).toBe(404);
    expect(contentType).toContain('application/javascript');
  });

  test('missing mjs module returns a javascript mime type', async () => {
    const {status, contentType} = await fetchContentType('/assets/missing.mjs');
    expect(status).toBe(404);
    expect(contentType).toContain('application/javascript');
  });

  test('missing page (no extension) still returns html', async () => {
    const {status, contentType} = await fetchContentType('/some/missing/page');
    expect(status).toBe(404);
    expect(contentType).toContain('text/html');
  });
});
