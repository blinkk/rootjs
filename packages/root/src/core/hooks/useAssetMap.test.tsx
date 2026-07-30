import {renderToString} from 'preact-render-to-string';
import {expect, test} from 'vitest';
import {renderJsxToString} from '../../jsx/jsx-render.js';
import type {Asset, AssetMap} from '../../render/asset-map/asset-map.js';
import {
  ASSET_MAP_CONTEXT,
  useAsset,
  useAssetMap,
  useAssetUrl,
} from './useAssetMap.js';

/**
 * Returns a stub asset map backed by a `src` -> `assetUrl` mapping, mimicking
 * the lookups performed by `BuildAssetMap` and `DevServerAssetMap`.
 */
function testAssetMap(assetUrls: Record<string, string>): AssetMap {
  return {
    get: (src: string): Asset | null => {
      if (!(src in assetUrls)) {
        return null;
      }
      return {
        src: src,
        assetUrl: assetUrls[src],
        getCssDeps: async () => [],
        getJsDeps: async () => [],
        getModulePreloadDeps: async () => [],
      };
    },
  };
}

const assetMap = testAssetMap({
  'bundles/main.ts': '/assets/main.abcd1234.js',
  // Route files are in the manifest for their CSS deps, but have no asset URL.
  'routes/index.tsx': '',
});

/**
 * The renderer picks between `preact-render-to-string` and `@blinkk/root/jsx`
 * depending on the `jsxRenderer` config, so the hook is verified against both.
 */
const renderers: Array<[string, (vnode: any) => string]> = [
  ['preact-render-to-string', (vnode) => renderToString(vnode)],
  ['@blinkk/root/jsx', (vnode) => renderJsxToString(vnode, {mode: 'minimal'})],
];

/** Renders a component with the asset map provided by the renderer. */
function render(
  vnode: any,
  options?: {assetMap?: AssetMap; renderJsx?: (vnode: any) => string}
) {
  const renderJsx = options?.renderJsx || renderers[0][1];
  if (!options?.assetMap) {
    return renderJsx(vnode);
  }
  return renderJsx(
    <ASSET_MAP_CONTEXT.Provider value={options.assetMap}>
      {vnode}
    </ASSET_MAP_CONTEXT.Provider>
  );
}

test.each(renderers)(
  'useAssetUrl() returns the compiled asset url (%s)',
  (_name, renderJsx) => {
    function Page() {
      return <div data-main={useAssetUrl('bundles/main.ts')} />;
    }
    expect(render(<Page />, {assetMap, renderJsx})).toBe(
      '<div data-main="/assets/main.abcd1234.js"></div>'
    );
  }
);

test('useAssetUrl() accepts a leading slash', () => {
  function Page() {
    return <div data-main={useAssetUrl('/bundles/main.ts')} />;
  }
  expect(render(<Page />, {assetMap})).toBe(
    '<div data-main="/assets/main.abcd1234.js"></div>'
  );
});

test('useAssetUrl() throws when the src is not in the asset map', () => {
  function Page() {
    return <div data-main={useAssetUrl('/bundles/missing.ts')} />;
  }
  expect(() => render(<Page />, {assetMap})).toThrow(
    'asset not found: /bundles/missing.ts'
  );
});

test('useAssetUrl() throws when the asset has no serving url', () => {
  function Page() {
    return <div data-main={useAssetUrl('routes/index.tsx')} />;
  }
  expect(() => render(<Page />, {assetMap})).toThrow(
    'asset not found: routes/index.tsx'
  );
});

test('useAsset() returns the asset from the module graph', () => {
  let asset: Asset | null = null;
  function Page() {
    asset = useAsset('/bundles/main.ts');
    return <div />;
  }
  render(<Page />, {assetMap});
  expect(asset!.src).toBe('bundles/main.ts');
  expect(asset!.assetUrl).toBe('/assets/main.abcd1234.js');
});

test('useAssetMap() throws when rendered outside of the provider', () => {
  function Page() {
    useAssetMap();
    return <div />;
  }
  expect(() => render(<Page />)).toThrow('ASSET_MAP_CONTEXT not found');
});
