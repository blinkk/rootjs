import {describe, it, expect} from 'vitest';
import {
  computeStoredPath,
  getRelativePath,
  getStoredIframePath,
  resolveInitialSrc,
} from './iframe-url-sync.js';

describe('getRelativePath', () => {
  it('returns pathname + search + hash', () => {
    expect(getRelativePath(new URL('https://x.com/tool/sub?a=1#h'))).toBe(
      '/tool/sub?a=1#h'
    );
    expect(getRelativePath(new URL('https://x.com/'))).toBe('/');
  });
});

describe('getStoredIframePath', () => {
  it('reads the path param', () => {
    expect(getStoredIframePath('?path=%2Ftool%2Fsub%3Fa%3D1')).toBe(
      '/tool/sub?a=1'
    );
    expect(getStoredIframePath('')).toBe('');
    expect(getStoredIframePath('?other=1')).toBe('');
  });
});

describe('resolveInitialSrc', () => {
  it('returns the iframe url when nothing is stored', () => {
    expect(resolveInitialSrc('https://x.com/tool', '')).toBe(
      'https://x.com/tool'
    );
  });

  it('restores a stored sub-path onto the tool origin', () => {
    expect(resolveInitialSrc('https://x.com/tool', '/tool/sub?a=1#h')).toBe(
      'https://x.com/tool/sub?a=1#h'
    );
  });

  // The stored path is origin-relative, so a trailing slash on the configured
  // iframe url does not change how it is restored.
  it('restores regardless of a trailing slash on the iframe url', () => {
    const withoutSlash = resolveInitialSrc(
      'https://x.com/tool',
      '/tool/sub?a=1#h'
    );
    const withSlash = resolveInitialSrc(
      'https://x.com/tool/',
      '/tool/sub?a=1#h'
    );
    expect(withoutSlash).toBe('https://x.com/tool/sub?a=1#h');
    expect(withSlash).toBe('https://x.com/tool/sub?a=1#h');
  });

  it('resolves relative iframe urls against the cms origin', () => {
    expect(resolveInitialSrc('/local-tool', '/local-tool/sub')).toBe(
      `${window.location.origin}/local-tool/sub`
    );
  });
});

describe('computeStoredPath', () => {
  it('stores a sub-path when navigated away from home', () => {
    expect(computeStoredPath('https://x.com/tool', '/tool/sub?a=1#h')).toBe(
      '/tool/sub?a=1#h'
    );
  });

  it('drops the param at the home location', () => {
    expect(computeStoredPath('https://x.com/tool', '/tool')).toBeNull();
  });

  // Trailing-slash differences between the configured url and the loaded
  // location should still be treated as home so the url stays clean.
  it('treats trailing-slash variants of home as home', () => {
    expect(computeStoredPath('https://x.com/tool', '/tool/')).toBeNull();
    expect(computeStoredPath('https://x.com/tool/', '/tool')).toBeNull();
    expect(computeStoredPath('https://x.com/tool/', '/tool/')).toBeNull();
  });

  it('preserves the sub-path (including its trailing slash) when stored', () => {
    expect(computeStoredPath('https://x.com/tool', '/tool/sub/')).toBe(
      '/tool/sub/'
    );
  });

  it('returns null for an empty relative path', () => {
    expect(computeStoredPath('https://x.com/tool', '')).toBeNull();
  });
});
