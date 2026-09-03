import {afterEach, describe, expect, it} from 'vitest';
import {getDocPreviewPath} from './doc-urls.js';
import {getPreviewDocCandidates} from './preview-doc-match.js';

/** Mirrors the collections and config of the in-repo `docs/` project. */
const DOCS_CTX = {
  rootConfig: {
    base: '/',
    domain: 'https://rootjs.dev',
    i18n: {locales: ['en', 'de', 'es', 'fr', 'it', 'pt']},
    server: {trailingSlash: true},
  },
  collections: {
    BlogPosts: {url: '/blog/[slug]'},
    BlogSandbox: {url: '/blog/sandbox/[slug]'},
    GlobalModules: {url: '/global-modules/[...slug]'},
    Guide: {url: '/guide/[slug]'},
    Pages: {url: '/[...slug]'},
    Sandbox: {url: '/sandbox/[...slug]'},
  },
};

/** Installs a `window.__ROOT_CTX` for the duration of a test. */
function setRootCtx(ctx: any) {
  (window as any).__ROOT_CTX = ctx;
}

/** Returns candidates as `"Collection/slug@locale"` strings, in rank order. */
function ids(pathname: string): string[] {
  return getPreviewDocCandidates(pathname).map(
    (candidate) =>
      `${candidate.collectionId}/${candidate.slug}@${candidate.locale}`
  );
}

afterEach(() => {
  delete (window as any).__ROOT_CTX;
});

describe('getPreviewDocCandidates', () => {
  it('round-trips the urls the forward path produces', () => {
    setRootCtx(DOCS_CTX);
    const docs = [
      {collectionId: 'Pages', slug: 'index', locale: ''},
      {collectionId: 'Pages', slug: 'about', locale: ''},
      {collectionId: 'Pages', slug: 'about--team', locale: ''},
      {collectionId: 'Guide', slug: 'getting-started', locale: ''},
      {collectionId: 'BlogPosts', slug: 'my-post', locale: ''},
      {collectionId: 'BlogSandbox', slug: 'foo', locale: ''},
      {collectionId: 'Pages', slug: 'about', locale: 'de'},
      {collectionId: 'Guide', slug: 'getting-started', locale: 'fr'},
    ];
    for (const doc of docs) {
      const path = getDocPreviewPath(doc);
      expect(getPreviewDocCandidates(path)[0]).toMatchObject(doc);
    }
  });

  // A catch-all `/[...slug]` collection matches every url, so overlapping
  // matches are expected; the most specific literal prefix has to win.
  it('ranks more specific collections first', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/blog/sandbox/foo/')).toEqual([
      'BlogSandbox/foo@',
      'BlogSandbox/foo--index@',
      'BlogPosts/sandbox--foo@',
      'BlogPosts/sandbox--foo--index@',
      'Pages/blog--sandbox--foo@',
      'Pages/blog--sandbox--foo--index@',
    ]);
  });

  it('resolves the site root to the index doc', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/')).toContain('Pages/index@');
  });

  // `/foo` is served by both the slug `foo` and the slug `foo--index`, since
  // the forward path renames a trailing `/index` to `/`.
  it('offers the index form of a slug, ranked lower', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/about/')).toEqual(['Pages/about@', 'Pages/about--index@']);
  });

  it('matches urls authored without a trailing slash', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/guide/getting-started')[0]).toBe('Guide/getting-started@');
  });

  it('ignores the cms itself', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/cms')).toEqual([]);
    expect(ids('/cms/content/Pages/about')).toEqual([]);
  });

  it('ignores static assets', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/static/main.js')).toEqual([]);
    expect(ids('/images/hero.png')).toEqual([]);
  });

  it('ignores relative and empty paths', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('')).toEqual([]);
    expect(ids('about')).toEqual([]);
  });

  it('handles projects without a trailing slash', () => {
    setRootCtx({
      ...DOCS_CTX,
      rootConfig: {...DOCS_CTX.rootConfig, server: {trailingSlash: false}},
    });
    expect(ids('/blog/my-post')[0]).toBe('BlogPosts/my-post@');
  });

  // The pattern's own trailing slash needs a slash to match against, which the
  // path doesn't have once trailing slashes are normalized away.
  it('resolves a prefixed collection root without a trailing slash', () => {
    setRootCtx({
      ...DOCS_CTX,
      rootConfig: {...DOCS_CTX.rootConfig, server: {trailingSlash: false}},
    });
    expect(ids('/blog')).toContain('BlogPosts/index@');
    expect(ids('')).toEqual([]);
  });

  it('resolves a prefixed collection root with a trailing slash', () => {
    setRootCtx(DOCS_CTX);
    expect(ids('/blog/')).toContain('BlogPosts/index@');
  });

  it('matches a pattern whose literal suffix ends in a slash', () => {
    setRootCtx({
      rootConfig: {
        base: '/',
        i18n: {locales: ['en']},
        server: {trailingSlash: false},
      },
      collections: {Docs: {url: '/docs/[slug]/overview/'}},
    });
    expect(ids('/docs/intro/overview')[0]).toBe('Docs/intro@');
  });

  // The default locale carries no prefix, so an empty locale has to be tried
  // before the url format gets a chance to eat a real path segment.
  it('handles a base path and a custom locale url format', () => {
    setRootCtx({
      rootConfig: {
        base: '/foo/',
        i18n: {
          locales: ['en', 'de'],
          urlFormat: '/intl/[locale]/[base]/[path]',
        },
        server: {trailingSlash: false},
      },
      collections: {Pages: {url: '/[...slug]'}},
    });
    expect(ids('/intl/de/foo/about')[0]).toBe('Pages/about@de');
    expect(ids('/foo/about')[0]).toBe('Pages/about@');
    expect(ids('/foo')).toContain('Pages/index@');
  });

  // Links rendered by the site are in serving space, but the pane's own src is
  // in preview space, so both have to resolve.
  it('matches both the preview url and the serving url', () => {
    setRootCtx({
      ...DOCS_CTX,
      collections: {
        Pages: {url: '/[...slug]', previewUrl: '/preview/[...slug]'},
      },
    });
    expect(ids('/preview/about/')[0]).toBe('Pages/about@');
    expect(ids('/about/')[0]).toBe('Pages/about@');
  });

  it('ignores collections that do not serve a url', () => {
    setRootCtx({...DOCS_CTX, collections: {Data: {}}});
    expect(ids('/about/')).toEqual([]);
  });

  it('returns nothing when the root context is unavailable', () => {
    expect(getPreviewDocCandidates('/about/')).toEqual([]);
  });
});
