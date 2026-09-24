import {expect, test, vi} from 'vitest';
import {RootRedirectConfig} from '../core/config.js';
import {redirectsMiddleware} from './redirects.js';

function runMiddleware(redirects: RootRedirectConfig[], path: string) {
  const middleware = redirectsMiddleware({redirects});
  const res = {redirect: vi.fn(), setHeader: vi.fn()};
  const next = vi.fn();
  middleware({path} as any, res as any, next);
  return {res, next};
}

test('redirects with params', () => {
  const {res, next} = runMiddleware(
    [{source: '/foo/[slug]', destination: '/bar/[slug]', type: 301}],
    '/foo/baz'
  );
  expect(res.redirect).toHaveBeenCalledWith(301, '/bar/baz');
  expect(next).not.toHaveBeenCalled();
});

test('ignores redirects with destination params missing from source', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const {res, next} = runMiddleware(
    [{source: '/foo/[slug]', destination: '/bar/[id]'}],
    '/foo/baz'
  );
  expect(warn).toHaveBeenCalled();
  expect(res.redirect).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
  warn.mockRestore();
});
