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
        parts('/myroute/foo/bar/?q=1#section')
      )
    ).toBe('/cms/tools/foo/bar/?q=1#section');
  });

  // `?preview=true` is an auth-transport param; it should be hidden from the
  // clean CMS URL while other params are preserved.
  it('strips preview=true from the cms url', () => {
    expect(
      iframeLocationToCmsUrl(
        '/myroute/foo',
        'foo',
        parts('/myroute/foo/bar/?preview=true#section')
      )
    ).toBe('/cms/tools/foo/bar/#section');
  });

  it('strips preview=true but keeps other params', () => {
    expect(
      iframeLocationToCmsUrl(
        '/myroute/foo',
        'foo',
        parts('/myroute/foo/bar/?preview=true&q=1')
      )
    ).toBe('/cms/tools/foo/bar/?q=1');
    expect(
      iframeLocationToCmsUrl(
        '/myroute/foo',
        'foo',
        parts('/myroute/foo/bar/?q=1&preview=true')
      )
    ).toBe('/cms/tools/foo/bar/?q=1');
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

  // The CMS URL strips `preview=true`, so it must be re-added onto the iframe
  // src when the configured iframe url uses it (otherwise a refresh would drop
  // preview/auth mode).
  it('restores preview=true from the configured iframe url', () => {
    expect(
      cmsUrlToIframeSrc(
        '/myroute/foo/?preview=true',
        'foo',
        parts('/cms/tools/foo/bar/')
      )
    ).toBe('http://localhost:3000/myroute/foo/bar/?preview=true');
  });

  it('restores preview=true alongside the cms url params', () => {
    expect(
      cmsUrlToIframeSrc(
        '/myroute/foo/?preview=true',
        'foo',
        parts('/cms/tools/foo/bar/?q=1')
      )
    ).toBe('http://localhost:3000/myroute/foo/bar/?q=1&preview=true');
  });

  it('does not add preview=true when the iframe url lacks it', () => {
    expect(
      cmsUrlToIframeSrc('/myroute/foo', 'foo', parts('/cms/tools/foo/bar/?q=1'))
    ).toBe('http://localhost:3000/myroute/foo/bar/?q=1');
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

  // With a preview-authed iframe url, the CMS URL stays clean (no preview) but
  // the iframe src keeps preview=true, and the round trip is stable.
  it('keeps the cms url clean while preserving preview on the iframe', () => {
    const iframeUrl = 'https://tool.example.com/app/?preview=true';
    const cleanCmsUrl = '/cms/tools/app/reports/?tab=all#top';
    const src = cmsUrlToIframeSrc(iframeUrl, 'app', parts(cleanCmsUrl));
    expect(src).toBe(
      'https://tool.example.com/app/reports/?tab=all&preview=true#top'
    );
    const loc = new URL(src);
    expect(
      iframeLocationToCmsUrl(iframeUrl, 'app', {
        pathname: loc.pathname,
        search: loc.search,
        hash: loc.hash,
      })
    ).toBe(cleanCmsUrl);
  });
});
