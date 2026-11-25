import {describe, expect, test, vi} from 'vitest';
import type {RootConfig} from '../core/config.js';
import type {Request} from '../core/types.js';
import type {ElementGraph} from '../node/element-graph.js';
import type {AssetMap} from './asset-map/asset-map.js';

const getStaticPathsSpy = vi.fn(async () => ({
  paths: [{params: {slug: 'hello-world'}}],
}));

const DummyPage = () => null;

vi.mock('virtual:root/routes', () => ({
  ROUTE_MODULES: {
    '/routes/index.tsx': {default: DummyPage},
    '/routes/about.tsx': {default: DummyPage},
    '/routes/blog/[slug].tsx': {
      default: DummyPage,
      getStaticPaths: getStaticPathsSpy,
    },
    '/routes/docs/[...slug].tsx': {
      default: DummyPage,
      getStaticPaths: getStaticPathsSpy,
    },
    '/routes/api/health.ts': {
      handle: () => {},
    },
    '/routes/helper.ts': {},
  },
  POD_ROUTE_MODULES: {},
}));

const {Renderer} = await import('./render.js');

describe('renderDevServer404', () => {
  test('renders static and parameterized route patterns without calling getStaticPaths', async () => {
    getStaticPathsSpy.mockClear();
    const rootConfig = {
      rootDir: '/tmp/test-project',
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
      },
    } as RootConfig;

    const renderer = new Renderer(rootConfig, {
      assetMap: {} as AssetMap,
      elementGraph: {} as ElementGraph,
    });

    const req = {
      originalUrl: '/missing-page',
      path: '/missing-page',
    } as Request;

    const {html} = await renderer.renderDevServer404(req);

    expect(getStaticPathsSpy).not.toHaveBeenCalled();
    expect(html).toContain('routes/index.tsx');
    expect(html).toContain('routes/about.tsx');
    expect(html).toContain('routes/blog/[slug].tsx');
    expect(html).toContain('/blog/[slug]/');
    expect(html).toContain('/fr/blog/[slug]/');
    expect(html).toContain('routes/docs/[...slug].tsx');
    expect(html).toContain('/docs/[...slug]');
    expect(html).toContain('routes/api/health.ts');
    expect(html).toContain('/api/health/');
    expect(html).not.toContain('routes/helper.ts');
    expect(html).toContain('url: /missing-page');
  });

  test('respects server.trailingSlash: false for route patterns', async () => {
    getStaticPathsSpy.mockClear();
    const rootConfig = {
      rootDir: '/tmp/test-project',
      server: {
        trailingSlash: false,
      },
    } as RootConfig;

    const renderer = new Renderer(rootConfig, {
      assetMap: {} as AssetMap,
      elementGraph: {} as ElementGraph,
    });

    const req = {
      originalUrl: '/nope',
      path: '/nope',
    } as Request;

    const {html} = await renderer.renderDevServer404(req);

    expect(getStaticPathsSpy).not.toHaveBeenCalled();
    expect(html).toContain('=>  /about\n');
    expect(html).toContain('=>  /blog/[slug]\n');
  });
});
