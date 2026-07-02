import {describe, it, expect} from 'vitest';
import {
  cmsToolPrefix,
  cmsUrlToIframeSrc,
  iframeLocationToCmsUrl,
} from './iframe-url-sync.js';

/** Builds a UrlParts from a relative url like "/foo?a=1#h". */
function parts(relative: string) {
  const url = new URL(relative, 'https://cms.example.com');
  return {pathname: url.pathname, search: url.search, hash: url.hash};
}

describe('cmsToolPrefix', () => {
  it('builds the tool route prefix', () => {
    expect(cmsToolPrefix('foo')).toBe('/cms/tools/foo');
  });
});

describe('iframeLocationToCmsUrl', () => {
  it('mirrors a sub-path onto the cms tool prefix', () => {
    expect(
      iframeLocationToCmsUrl('/myroute/foo', 'foo', parts('/myroute/foo/bar/'))
    ).toBe('/cms/tools/foo/bar/');
  });

  it('preserves query params and hash', () => {
    expect(
      iframeLocationToCmsUrl(
        '/myroute/foo',
        'foo',
        parts('/myroute/foo/bar/?preview=true#section')
      )
    ).toBe('/cms/tools/foo/bar/?preview=true#section');
  });

  it('returns the bare prefix at the tool home', () => {
    expect(
      iframeLocationToCmsUrl('/myroute/foo', 'foo', parts('/myroute/foo'))
    ).toBe('/cms/tools/foo');
  });

  // A trailing slash on the iframe url should not change the mirrored result.
  it('works whether or not the iframe url has a trailing slash', () => {
    expect(
      iframeLocationToCmsUrl('/myroute/foo/', 'foo', parts('/myroute/foo/bar/'))
    ).toBe('/cms/tools/foo/bar/');
    expect(
      iframeLocationToCmsUrl('/myroute/foo', 'foo', parts('/myroute/foo/bar/'))
    ).toBe('/cms/tools/foo/bar/');
  });

  it('handles absolute (cross-origin) iframe urls', () => {
    expect(
      iframeLocationToCmsUrl(
        'https://tool.example.com/app',
        'design',
        parts('/app/insights/?q=1')
      )
    ).toBe('/cms/tools/design/insights/?q=1');
  });

  it('handles a tool mounted at the domain root', () => {
    expect(
      iframeLocationToCmsUrl('https://tool.example.com/', 'foo', parts('/bar/'))
    ).toBe('/cms/tools/foo/bar/');
  });

  it('returns null when the iframe navigates outside its base path', () => {
    expect(
      iframeLocationToCmsUrl('/myroute/foo', 'foo', parts('/somewhere/else'))
    ).toBeNull();
  });

  // Guard against a prefix that is a string-prefix but not a path-prefix.
  it('does not treat a sibling path as a sub-path', () => {
    expect(
      iframeLocationToCmsUrl('/myroute/foo', 'foo', parts('/myroute/foobar'))
    ).toBeNull();
  });
});

describe('cmsUrlToIframeSrc', () => {
  it('appends the cms sub-path onto the iframe base', () => {
    expect(
      cmsUrlToIframeSrc('/myroute/foo', 'foo', parts('/cms/tools/foo/bar/'))
    ).toBe('http://localhost:3000/myroute/foo/bar/');
  });

  it('preserves query params and hash', () => {
    expect(
      cmsUrlToIframeSrc(
        'https://tool.example.com/app',
        'design',
        parts('/cms/tools/design/insights/?preview=true#s')
      )
    ).toBe('https://tool.example.com/app/insights/?preview=true#s');
  });

  it('returns the configured iframe url verbatim at the tool home', () => {
    expect(
      cmsUrlToIframeSrc('/myroute/foo/', 'foo', parts('/cms/tools/foo'))
    ).toBe('/myroute/foo/');
  });

  // Round-trips regardless of a trailing slash on the configured iframe url.
  it('restores the same sub-path with or without a trailing slash', () => {
    const withSlash = cmsUrlToIframeSrc(
      'https://tool.example.com/app/',
      'app',
      parts('/cms/tools/app/x/y/')
    );
    const withoutSlash = cmsUrlToIframeSrc(
      'https://tool.example.com/app',
      'app',
      parts('/cms/tools/app/x/y/')
    );
    expect(withSlash).toBe('https://tool.example.com/app/x/y/');
    expect(withoutSlash).toBe('https://tool.example.com/app/x/y/');
  });

  it('handles a tool mounted at the domain root', () => {
    expect(
      cmsUrlToIframeSrc(
        'https://tool.example.com/',
        'foo',
        parts('/cms/tools/foo/bar/')
      )
    ).toBe('https://tool.example.com/bar/');
  });
});

describe('round trip', () => {
  it('cms -> iframe -> cms is stable', () => {
    const iframeUrl = 'https://tool.example.com/app';
    const cmsUrl = '/cms/tools/app/reports/2024/?tab=all#top';
    const src = cmsUrlToIframeSrc(iframeUrl, 'app', parts(cmsUrl));
    const loc = new URL(src);
    expect(
      iframeLocationToCmsUrl(iframeUrl, 'app', {
        pathname: loc.pathname,
        search: loc.search,
        hash: loc.hash,
      })
    ).toBe(cmsUrl);
  });
});
