import {describe, expect, it} from 'vitest';
import {
  getPreviewPathFromUrlKey,
  getPreviewSrcFromUrlKey,
  getPreviewUrlKey,
  getPreviewUrlKeyFromUrl,
} from './preview-url-sync.js';

describe('getPreviewUrlKey', () => {
  it('strips the preview param', () => {
    expect(
      getPreviewUrlKey({pathname: '/about', search: '?preview=true'})
    ).toBe('/about');
  });

  it('preserves other query params', () => {
    expect(
      getPreviewUrlKey({pathname: '/about', search: '?preview=true&debug=1'})
    ).toBe('/about?debug=1');
  });

  it('handles locations with no search', () => {
    expect(getPreviewUrlKey({pathname: '/', search: ''})).toBe('/');
  });
});

describe('getPreviewUrlKeyFromUrl', () => {
  it('returns the key for a relative url', () => {
    expect(getPreviewUrlKeyFromUrl('/about?preview=true')).toBe('/about');
  });

  it('returns the key for a same-origin absolute url', () => {
    const url = `${window.location.origin}/about?preview=true`;
    expect(getPreviewUrlKeyFromUrl(url)).toBe('/about');
  });

  it('ignores the hash', () => {
    expect(getPreviewUrlKeyFromUrl('/about?preview=true#team')).toBe('/about');
  });

  it('returns null for about:blank', () => {
    expect(getPreviewUrlKeyFromUrl('about:blank')).toBe(null);
  });

  it('returns null for empty and cross-origin urls', () => {
    expect(getPreviewUrlKeyFromUrl('')).toBe(null);
    expect(getPreviewUrlKeyFromUrl('https://example.com/about')).toBe(null);
  });
});

describe('getPreviewSrcFromUrlKey', () => {
  it('re-adds the preview param', () => {
    expect(getPreviewSrcFromUrlKey('/about')).toBe('/about?preview=true');
  });

  it('preserves other params', () => {
    expect(getPreviewSrcFromUrlKey('/about?debug=1')).toBe(
      '/about?debug=1&preview=true'
    );
  });
});

describe('getPreviewPathFromUrlKey', () => {
  it('drops the search params', () => {
    expect(getPreviewPathFromUrlKey('/about?debug=1')).toBe('/about');
    expect(getPreviewPathFromUrlKey('/about')).toBe('/about');
  });
});
