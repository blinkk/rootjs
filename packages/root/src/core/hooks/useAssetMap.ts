import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import type {Asset, AssetMap} from '../../render/asset-map/asset-map.js';

export const ASSET_MAP_CONTEXT = createContext<AssetMap | null>(null);

/**
 * Returns the asset map for the current render.
 */
export function useAssetMap(): AssetMap {
  const assetMap = useContext(ASSET_MAP_CONTEXT);
  if (!assetMap) {
    throw new Error('ASSET_MAP_CONTEXT not found');
  }
  return assetMap;
}

/**
 * Returns an asset from the project's module graph. Paths are relative to the
 * project root and may optionally start with `/`.
 */
export function useAsset(src: string): Asset {
  const normalizedSrc = src.replace(/^\/+/, '');
  const asset = useAssetMap().get(normalizedSrc);
  if (!asset) {
    throw new Error(`asset not found: ${src}`);
  }
  return asset;
}

/**
 * Returns the serving URL for a file compiled from the project's module graph.
 *
 * Usage:
 *
 * ```tsx
 * const customJs = useAssetUrl('/bundles/foo.ts');
 * return <div data-custom-js={customJs} />;
 * ```
 */
export function useAssetUrl(src: string): string {
  const assetUrl = useAsset(src).assetUrl;
  if (!assetUrl) {
    throw new Error(`asset not found: ${src}`);
  }
  return assetUrl;
}
