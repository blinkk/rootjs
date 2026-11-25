import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect, test, vi} from 'vitest';
import {RootConfig} from '../../core/config.js';
import {BuildAssetMap} from './build-asset-map.js';

const rootConfig = {rootDir: '/tmp/does-not-exist'} as RootConfig;

/**
 * A component reachable only via its own entry (as with a dynamically-imported
 * template) still resolves its CSS through `getCssDeps()`. This underpins the
 * `<StyleDeps>` per-page CSS mechanism: the route does not statically import the
 * template, but rendering `<StyleDeps src>` lets Root resolve the template's CSS.
 */
test('getCssDeps() resolves a dynamically-imported component chunk CSS', async () => {
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, {
    'routes/[[...page]].tsx': {
      src: 'routes/[[...page]].tsx',
      assetUrl: '',
      importedModules: ['converters.js'],
      importedCss: [],
      isElement: false,
    },
    // The converters chunk imports templates *dynamically*, so it has no static
    // importedModules edge to them — mirroring the eager-glob -> lazy switch.
    'converters.js': {
      src: 'converters.js',
      assetUrl: '/assets/converters.js',
      importedModules: [],
      importedCss: [],
      isElement: false,
    },
    'templates/Foo/Foo.tsx': {
      src: 'templates/Foo/Foo.tsx',
      assetUrl: '/assets/Foo.js',
      importedModules: [],
      importedCss: ['/assets/Foo.css'],
      isElement: false,
    },
  });

  // The route alone does NOT pull in the template's CSS (the point of the fix).
  const routeAsset = assetMap.get('routes/[[...page]].tsx')!;
  expect(await routeAsset.getCssDeps()).not.toContain('/assets/Foo.css');

  // Resolving the component src directly (what `<StyleDeps src>` triggers) does.
  const componentAsset = assetMap.get('templates/Foo/Foo.tsx')!;
  expect(await componentAsset.getCssDeps()).toContain('/assets/Foo.css');
});

test('BuildAsset resolves transitive deps across cycles and memoizes results', async () => {
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, {
    'routes/index.tsx': {
      src: 'routes/index.tsx',
      assetUrl: '',
      importedModules: ['_chunk-a.js'],
      importedCss: ['/assets/route.css'],
      isElement: false,
    },
    '_chunk-a.js': {
      src: '_chunk-a.js',
      assetUrl: '/assets/chunk-a.js',
      importedModules: ['_chunk-b.js'],
      importedCss: ['/assets/chunk-a.css'],
      isElement: false,
    },
    '_chunk-b.js': {
      src: '_chunk-b.js',
      assetUrl: '/assets/chunk-b.js',
      importedModules: ['elements/root-deep/root-deep.ts', '_chunk-a.js'],
      importedCss: ['/assets/chunk-b.css'],
      isElement: false,
    },
    'elements/root-deep/root-deep.ts': {
      src: 'elements/root-deep/root-deep.ts',
      assetUrl: '/assets/root-deep.js',
      importedModules: [],
      importedCss: ['/assets/root-deep.css'],
      isElement: true,
    },
  });

  const routeAsset = assetMap.get('routes/index.tsx')!;
  const getSpy = vi.spyOn(assetMap, 'get');

  const cssDeps1 = await routeAsset.getCssDeps();
  const jsDeps1 = await routeAsset.getJsDeps();
  const preloadDeps1 = await routeAsset.getModulePreloadDeps();

  expect(cssDeps1).toEqual([
    '/assets/route.css',
    '/assets/chunk-a.css',
    '/assets/chunk-b.css',
    '/assets/root-deep.css',
  ]);
  expect(jsDeps1).toEqual(['/assets/root-deep.js']);
  expect(preloadDeps1).toEqual([
    '/assets/chunk-a.js',
    '/assets/chunk-b.js',
    '/assets/root-deep.js',
  ]);

  getSpy.mockClear();

  // Repeat calls return the memoized arrays without re-walking the graph.
  expect(await routeAsset.getCssDeps()).toBe(cssDeps1);
  expect(await routeAsset.getJsDeps()).toBe(jsDeps1);
  expect(await routeAsset.getModulePreloadDeps()).toBe(preloadDeps1);
  expect(getSpy).not.toHaveBeenCalled();
});

test('BuildAsset collects deps breadth-first, including deeply nested imports', async () => {
  const chunk = (name: string, importedModules: string[]) => ({
    src: `_${name}.js`,
    assetUrl: `/assets/${name}.js`,
    importedModules,
    importedCss: [`/assets/${name}.css`],
    isElement: true,
  });
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, {
    'routes/index.tsx': {
      src: 'routes/index.tsx',
      assetUrl: '',
      importedModules: ['_a.js', '_b.js'],
      importedCss: ['/assets/route.css'],
      isElement: false,
    },
    '_a.js': chunk('a', ['_c.js']),
    '_b.js': chunk('b', []),
    '_c.js': chunk('c', ['_d.js']),
    '_d.js': chunk('d', ['_e.js']),
    '_e.js': chunk('e', ['_f.js']),
    '_f.js': chunk('f', ['_a.js']),
  });

  // An importer's direct imports are listed before their nested imports, so
  // the stylesheet order (and the CSS cascade) stays stable.
  const routeAsset = assetMap.get('routes/index.tsx')!;
  const names = ['a', 'b', 'c', 'd', 'e', 'f'];
  expect(await routeAsset.getCssDeps()).toEqual([
    '/assets/route.css',
    ...names.map((name) => `/assets/${name}.css`),
  ]);
  expect(await routeAsset.getJsDeps()).toEqual(
    names.map((name) => `/assets/${name}.js`)
  );
  expect(await routeAsset.getModulePreloadDeps()).toEqual(
    names.map((name) => `/assets/${name}.js`)
  );
});

test('BuildAssetMap.get() caches resolved symlinks and negative misses', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-bam-cache-'));
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const realFile = path.join(tmpDir, 'elements', 'real.ts');
    const linkFile = path.join(tmpDir, 'elements', 'link.ts');
    fs.mkdirSync(path.dirname(realFile), {recursive: true});
    fs.writeFileSync(realFile, 'export {};\n');
    fs.symlinkSync(realFile, linkFile);

    const assetMap = BuildAssetMap.fromRootManifest(
      {rootDir: tmpDir} as RootConfig,
      {
        'elements/real.ts': {
          src: 'elements/real.ts',
          assetUrl: '/assets/real.js',
          importedModules: [],
          importedCss: [],
          isElement: true,
        },
      }
    );

    const existsSpy = vi.spyOn(fs, 'existsSync');
    const realpathSpy = vi.spyOn(fs, 'realpathSync');

    // First lookup of symlink resolves via fs; second hits cache.
    const linked1 = assetMap.get('elements/link.ts');
    expect(linked1?.assetUrl).toBe('/assets/real.js');
    expect(existsSpy).toHaveBeenCalledTimes(1);
    expect(realpathSpy).toHaveBeenCalledTimes(1);

    const linked2 = assetMap.get('elements/link.ts');
    expect(linked2).toBe(linked1);
    expect(existsSpy).toHaveBeenCalledTimes(1);
    expect(realpathSpy).toHaveBeenCalledTimes(1);

    // First lookup of missing src checks fs once; second hits negative cache.
    expect(assetMap.get('routes/missing.tsx')).toBeNull();
    expect(existsSpy).toHaveBeenCalledTimes(2);
    expect(assetMap.get('routes/missing.tsx')).toBeNull();
    expect(existsSpy).toHaveBeenCalledTimes(2);

    // Cached symlink/miss entries do not leak into toJson().
    expect(Object.keys(assetMap.toJson())).toEqual(['elements/real.ts']);
  } finally {
    vi.restoreAllMocks();
    logSpy.mockRestore();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});

test('BuildAssetMap.get() resolves backslash src paths to forward-slash manifest keys', () => {
  const assetMap = BuildAssetMap.fromRootManifest(rootConfig, {
    'elements/root-foo/root-foo.ts': {
      src: 'elements/root-foo/root-foo.ts',
      assetUrl: '/assets/root-foo.js',
      importedModules: [],
      importedCss: [],
      isElement: true,
    },
  });

  const existsSpy = vi.spyOn(fs, 'existsSync');
  try {
    const asset = assetMap.get('elements\\root-foo\\root-foo.ts');
    expect(asset?.assetUrl).toBe('/assets/root-foo.js');
    // Repeat lookup continues to hit without negative caching or fs access.
    expect(assetMap.get('elements\\root-foo\\root-foo.ts')).toBe(asset);
    expect(existsSpy).not.toHaveBeenCalled();
  } finally {
    existsSpy.mockRestore();
  }
});
