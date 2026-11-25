import {expect, test, vi} from 'vitest';
import {headersMiddleware, trailingSlashMiddleware} from './common.js';

function runMiddleware(trailingSlash: boolean, originalUrl: string) {
  const rootConfig: any = {server: {trailingSlash}};
  const middleware = trailingSlashMiddleware({rootConfig});
  const res = {redirect: vi.fn(), setHeader: vi.fn()};
  const next = vi.fn();
  const path = originalUrl.split('?')[0];
  middleware({path, originalUrl} as any, res as any, next);
  return {res, next};
}

test('adds a trailing slash without caching the redirect', () => {
  const {res, next} = runMiddleware(true, '/foo?bar=1');
  expect(res.redirect).toHaveBeenCalledWith(301, '/foo/?bar=1');
  expect(res.setHeader).toHaveBeenCalledWith(
    'cache-control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );
  expect(next).not.toHaveBeenCalled();
});

test('removes a trailing slash without caching the redirect', () => {
  const {res, next} = runMiddleware(false, '/foo/');
  expect(res.redirect).toHaveBeenCalledWith(301, '/foo');
  expect(res.setHeader).toHaveBeenCalledWith(
    'cache-control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );
  expect(next).not.toHaveBeenCalled();
});

test('does not redirect urls that match the config', () => {
  const {res, next} = runMiddleware(true, '/foo/');
  expect(res.redirect).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
});

test('headersMiddleware applies matching glob rules and skips invalid entries', () => {
  const rootConfig: any = {
    server: {
      headers: [
        {
          source: '/assets/**',
          headers: [{key: 'Cache-Control', value: 'public, max-age=31536000'}],
        },
        {
          source: '/**/*.js',
          headers: [
            {key: 'X-Asset-Type', value: 'script'},
            {key: '', value: 'ignored'},
          ],
        },
        {source: '', headers: [{key: 'X-Invalid', value: '1'}]},
        {source: '/empty/**', headers: []},
      ],
    },
  };
  const middleware = headersMiddleware({rootConfig});

  const res1 = {setHeader: vi.fn()};
  const next1 = vi.fn();
  middleware({path: '/assets/app.js'} as any, res1 as any, next1);
  expect(res1.setHeader).toHaveBeenCalledTimes(2);
  expect(res1.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'public, max-age=31536000'
  );
  expect(res1.setHeader).toHaveBeenCalledWith('X-Asset-Type', 'script');
  expect(next1).toHaveBeenCalled();

  const res2 = {setHeader: vi.fn()};
  const next2 = vi.fn();
  middleware({path: '/about'} as any, res2 as any, next2);
  expect(res2.setHeader).not.toHaveBeenCalled();
  expect(next2).toHaveBeenCalled();
});
