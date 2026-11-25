import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach, vi} from 'vitest';
import type {Route, RouteModule} from '../src/core/types.js';
import type {StaticPathsCache} from '../src/render/router.js';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/sitemap');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build sitemap project', async () => {
  await fixture.build();
  const sitemap = path.join(fixture.distDir, 'html/sitemap.xml');
  assert.isTrue(await fileExists(sitemap));
  const xml = await fs.readFile(sitemap, 'utf-8');
  expect(xml).toMatchInlineSnapshot(`
    "<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
    <url>
      <loc>https://www.example.com/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
    </url>
    <url>
      <loc>https://www.example.com/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/de/</loc>
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/de/bar/</loc>
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/de/baz/</loc>
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/de/foo/</loc>
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/en_ca/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/en_ca/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/en_ca/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/en_ca/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/en_gb/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/en_gb/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/en_gb/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/en_gb/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/en/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/en/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/en/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/en/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/fr_ca/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/fr_ca/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/fr_ca/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/fr_ca/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr" href="https://www.example.com/fr/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    <url>
      <loc>https://www.example.com/fr/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/" />
    </url>
    <url>
      <loc>https://www.example.com/fr/bar/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/bar/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/bar/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/bar/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/bar/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/bar/" />
    </url>
    <url>
      <loc>https://www.example.com/fr/baz/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/baz/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/baz/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/baz/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/baz/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/baz/" />
    </url>
    <url>
      <loc>https://www.example.com/fr/foo/</loc>
      <xhtml:link rel="alternate" hreflang="de" href="https://www.example.com/de/foo/" />
      <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/foo/" />
      <xhtml:link rel="alternate" hreflang="en-CA" href="https://www.example.com/en_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="en-GB" href="https://www.example.com/en_gb/foo/" />
      <xhtml:link rel="alternate" hreflang="fr-CA" href="https://www.example.com/fr_ca/foo/" />
      <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/foo/" />
    </url>
    </urlset>"
  `);
});

test('deduplicates getStaticPaths across locales, isolates params under concurrent renderRoute, and evicts rejected cache entries', async () => {
  const getStaticPaths = vi.fn(async () => ({
    paths: [{params: {slug: 'hello'}}],
  }));
  const observedLocales: Array<{before: string; after: string}> = [];
  const routeModule: RouteModule = {
    default: ((props: any) => props.locale) as any,
    getStaticPaths,
    getStaticProps: async ({params}) => {
      const before = params.$locale;
      // Yield so concurrent renders interleave before reading `$locale` again.
      await new Promise((resolve) => setTimeout(resolve, 10));
      const after = params.$locale;
      observedLocales.push({before, after});
      return {props: {locale: after}, locale: after};
    },
  };

  vi.resetModules();
  vi.doMock('virtual:root/routes', () => ({
    ROUTE_MODULES: {'/routes/blog/[slug].tsx': routeModule},
    POD_ROUTE_MODULES: {},
  }));
  try {
    const {Renderer} = await import('../src/render/render.js');
    const {Router} = await import('../src/render/router.js');

    const rootConfig: any = {
      rootDir: '/test',
      i18n: {
        locales: ['en', 'de', 'fr'],
        defaultLocale: 'en',
        urlFormat: '/[locale]/[base]/[path]',
      },
    };

    const renderer = new Renderer(rootConfig, {
      assetMap: {get: async () => undefined} as any,
      elementGraph: {sourceFiles: {}} as any,
    });
    const sitemap = await renderer.getSitemap();

    // `getStaticPaths()` is called once across x-default + 3 locales.
    expect(getStaticPaths).toHaveBeenCalledTimes(1);

    const items = Object.values(sitemap);
    expect(items).toHaveLength(4);
    // Every localized SitemapItem has its own isolated `params` object.
    const uniqueParams = new Set(items.map((item) => item.params));
    expect(uniqueParams.size).toBe(4);

    // Concurrent `renderRoute()` calls do not clobber each other's `$locale`
    // or mutate `SitemapItem.params`.
    const rendered = await Promise.all(
      items.map((item) =>
        renderer.renderRoute(item.route, {routeParams: item.params})
      )
    );
    expect(rendered).toHaveLength(4);
    for (const entry of observedLocales) {
      expect(entry.before).toBe(entry.after);
    }
    expect(observedLocales.map((e) => e.after).sort()).toEqual([
      'de',
      'en',
      'en',
      'fr',
    ]);
    for (const item of items) {
      expect(item.params.$locale).toBeUndefined();
    }

    // Rejected `getStaticPaths()` promises are evicted from `StaticPathsCache`.
    let attempts = 0;
    const flakyModule: RouteModule = {
      default: (() => null) as any,
      getStaticPaths: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('transient error');
        }
        return {paths: [{params: {slug: 'recovered'}}]};
      },
    };
    const flakyRoute: Route = {
      src: 'routes/blog/[slug].tsx',
      module: flakyModule,
      locale: 'en',
      isDefaultLocale: true,
      routePath: '/blog/[slug]',
      localeRoutePath: '/[locale]/blog/[slug]',
    };
    const router = new Router(rootConfig);
    const cache: StaticPathsCache = new Map();
    await expect(
      router.getAllPathsForRoute('/blog/[slug]', flakyRoute, {
        staticPathsCache: cache,
      })
    ).rejects.toThrow('transient error');
    // Wait a microtask for the `.catch()` eviction handler to run.
    await Promise.resolve();
    expect(cache.has(flakyModule)).toBe(false);

    const recovered = await router.getAllPathsForRoute(
      '/blog/[slug]',
      flakyRoute,
      {staticPathsCache: cache}
    );
    expect(recovered).toEqual([
      {urlPath: '/blog/recovered', params: {slug: 'recovered'}},
    ]);
    expect(attempts).toBe(2);
  } finally {
    vi.doUnmock('virtual:root/routes');
    vi.resetModules();
  }
});
