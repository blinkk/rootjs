import {expect, test} from 'vitest';
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
