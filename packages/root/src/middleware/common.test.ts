import {expect, test, vi} from 'vitest';
import {trailingSlashMiddleware} from './common.js';

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
