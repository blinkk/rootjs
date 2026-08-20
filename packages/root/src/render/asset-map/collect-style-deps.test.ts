import {expect, test, vi} from 'vitest';
import {Asset, AssetMap} from './asset-map.js';
import {collectStyleDeps} from './collect-style-deps.js';

function fakeAsset(src: string, cssDeps: string[]): Asset {
  return {
    src,
    assetUrl: `/assets/${src}.js`,
    getCssDeps: vi.fn(async () => cssDeps),
    getJsDeps: async () => [],
    getModulePreloadDeps: async () => [],
  };
}

function fakeAssetMap(assets: Record<string, Asset>): AssetMap {
  return {
    get: vi.fn((src: string) => assets[src] ?? null),
  };
}

test('collects CSS deps for registered components', async () => {
  const assetMap = fakeAssetMap({
    'templates/Foo/Foo.tsx': fakeAsset('Foo', ['/assets/Foo.css']),
    'templates/Bar/Bar.tsx': fakeAsset('Bar', ['/assets/Bar.css']),
  });
  const cssDeps = new Set<string>();

  await collectStyleDeps(
    assetMap,
    ['templates/Foo/Foo.tsx', 'templates/Bar/Bar.tsx'],
    cssDeps
  );

  expect(Array.from(cssDeps).sort()).toEqual([
    '/assets/Bar.css',
    '/assets/Foo.css',
  ]);
});

test('dedupes a src repeated many times (e.g. a PageModules loop)', async () => {
  const fooAsset = fakeAsset('Foo', ['/assets/Foo.css']);
  const assetMap = fakeAssetMap({'templates/Foo/Foo.tsx': fooAsset});
  const cssDeps = new Set<string>();

  // The same template rendered five times registers five <StyleDeps> entries.
  await collectStyleDeps(
    assetMap,
    Array(5).fill('templates/Foo/Foo.tsx'),
    cssDeps
  );

  // The CSS URL appears exactly once...
  expect(Array.from(cssDeps)).toEqual(['/assets/Foo.css']);
  // ...and the asset is resolved only once, not per occurrence.
  expect(assetMap.get).toHaveBeenCalledTimes(1);
  expect(fooAsset.getCssDeps).toHaveBeenCalledTimes(1);
});

test('dedupes overlapping CSS shared by different components', async () => {
  const assetMap = fakeAssetMap({
    'templates/Foo/Foo.tsx': fakeAsset('Foo', [
      '/assets/shared.css',
      '/assets/Foo.css',
    ]),
    'templates/Bar/Bar.tsx': fakeAsset('Bar', [
      '/assets/shared.css',
      '/assets/Bar.css',
    ]),
  });
  const cssDeps = new Set<string>();

  await collectStyleDeps(
    assetMap,
    ['templates/Foo/Foo.tsx', 'templates/Bar/Bar.tsx'],
    cssDeps
  );

  expect(Array.from(cssDeps).sort()).toEqual([
    '/assets/Bar.css',
    '/assets/Foo.css',
    '/assets/shared.css',
  ]);
});

test('preserves existing cssDeps and skips ?inline deps', async () => {
  const assetMap = fakeAssetMap({
    'templates/Foo/Foo.tsx': fakeAsset('Foo', [
      '/assets/Foo.css',
      '/assets/Foo.css?inline',
    ]),
  });
  // A route-level dep already collected before <StyleDeps> runs.
  const cssDeps = new Set<string>(['/assets/route.css']);

  await collectStyleDeps(assetMap, ['templates/Foo/Foo.tsx'], cssDeps);

  expect(Array.from(cssDeps).sort()).toEqual([
    '/assets/Foo.css',
    '/assets/route.css',
  ]);
});

test('ignores unknown srcs', async () => {
  const assetMap = fakeAssetMap({});
  const cssDeps = new Set<string>();

  await collectStyleDeps(assetMap, ['templates/Missing/Missing.tsx'], cssDeps);

  expect(cssDeps.size).toBe(0);
});
