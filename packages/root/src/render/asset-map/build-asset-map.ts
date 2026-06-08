import fs from 'node:fs';
import path from 'node:path';
import {Manifest} from 'vite';
import {RootConfig} from '../../core/config.js';
import {ElementGraph} from '../../node/element-graph.js';
import {isJsFile} from '../../utils/fsutils.js';
import {Asset, AssetMap} from './asset-map.js';

export type BuildAssetManifest = Record<
  string,
  {
    src: string;
    assetUrl: string;
    importedModules: string[];
    importedCss: string[];
    isElement: boolean;
  }
>;

/**
 * A pod route, used to alias the route's virtual `pod/<name>/...` src to the
 * real asset built from the route's file. See `fromViteManifest()`.
 */
export interface PodRouteAsset {
  /** Virtual src, e.g. `pod/<name>/<relPath>`. */
  src: string;
  /** Absolute path to the pod route file. */
  filePath: string;
}

export class BuildAssetMap implements AssetMap {
  private rootConfig: RootConfig;
  private srcToAsset: Map<string, BuildAsset>;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    this.srcToAsset = new Map();
  }

  async get(src: string): Promise<Asset | null> {
    const asset = this.srcToAsset.get(src);
    if (asset) {
      return asset;
    }
    // Try resolving the realpath of the asset, following symlinks.
    const realSrc = realPathRelativeTo(this.rootConfig.rootDir, src);
    if (realSrc !== src) {
      const asset = this.srcToAsset.get(realSrc);
      if (asset) {
        return asset;
      }
    }
    console.log(`could not find build asset: ${src}`);
    return null;
  }

  private add(asset: BuildAsset) {
    this.srcToAsset.set(asset.src, asset);
  }

  toJson(): BuildAssetManifest {
    const result: BuildAssetManifest = {};
    for (const src of this.srcToAsset.keys()) {
      result[src] = this.srcToAsset.get(src)!.toJson();
    }
    return result;
  }

  static fromViteManifest(
    rootConfig: RootConfig,
    clientManifest: Manifest,
    elementsGraph: ElementGraph,
    podRoutes: PodRouteAsset[] = []
  ) {
    const assetMap = new BuildAssetMap(rootConfig);

    const elementFiles = new Set();
    Object.values(elementsGraph.sourceFiles).forEach((elementSource) => {
      elementFiles.add(elementSource.relPath);
      // Vite will resolve symlinks, so we need to follow the src and add the
      // realpath to the element files.
      const realSrc = realPathRelativeTo(
        rootConfig.rootDir,
        elementSource.relPath
      );
      if (realSrc !== elementSource.filePath) {
        elementFiles.add(realSrc);
      }
    });

    Object.keys(clientManifest).forEach((manifestKey) => {
      const src = manifestKey;
      const manifestChunk = clientManifest[manifestKey];
      const isElement = elementFiles.has(src);
      // NOTES(stevenle): routes/ files are included in the manifest for
      // their CSS deps, but do not have an asset URL.
      const assetUrl =
        src.startsWith('routes/') && isJsFile(src)
          ? ''
          : `/${manifestChunk.file}`;
      const assetData = {
        src: src,
        assetUrl: assetUrl,
        importedModules: manifestChunk.imports || [],
        importedCss: (manifestChunk.css || []).map((relPath) => `/${relPath}`),
        isElement: isElement,
      };
      assetMap.add(new BuildAsset(assetMap, assetData));
    });

    // Pod routes are looked up by their virtual `pod/<name>/...` src at render
    // time, but the manifest keys them by their real file path. Register an
    // alias for each pod route so `get(route.src)` resolves to the built asset
    // (and the route's CSS deps are collected) instead of logging
    // "could not find build asset". Like user `routes/`, the alias has no asset
    // URL of its own (the route's client JS is injected via elements/bundles).
    podRoutes.forEach((podRoute) => {
      if (assetMap.srcToAsset.has(podRoute.src)) {
        return;
      }
      const relPath = path
        .relative(rootConfig.rootDir, podRoute.filePath)
        .replace(/\\/g, '/');
      const candidateKeys = [
        relPath,
        realPathRelativeTo(rootConfig.rootDir, relPath),
      ];
      for (const key of candidateKeys) {
        const asset = assetMap.srcToAsset.get(key);
        if (asset) {
          assetMap.add(
            new BuildAsset(assetMap, {
              ...asset.toJson(),
              src: podRoute.src,
              assetUrl: '',
            })
          );
          break;
        }
      }
    });

    return assetMap;
  }

  static fromRootManifest(
    rootConfig: RootConfig,
    rootManifest: BuildAssetManifest
  ) {
    const assetMap = new BuildAssetMap(rootConfig);
    Object.keys(rootManifest).forEach((moduleId) => {
      const assetData = rootManifest[moduleId];
      assetMap.add(new BuildAsset(assetMap, assetData));
    });
    return assetMap;
  }
}

/**
 * Returns the realpath of a src file, relative to the rootDir.
 */
function realPathRelativeTo(rootDir: string, src: string) {
  const fullPath = path.resolve(rootDir, src);
  if (!fs.existsSync(fullPath)) {
    return src;
  }
  const realpath = fs.realpathSync(path.resolve(rootDir, src));
  return path.relative(rootDir, realpath);
}

export class BuildAsset {
  src: string;
  assetUrl: string;
  private assetMap: BuildAssetMap;
  private importedModules: string[];
  private importedCss: string[];
  isElement: boolean;

  constructor(
    assetMap: BuildAssetMap,
    assetData: {
      src: string;
      assetUrl: string;
      importedModules: string[];
      importedCss: string[];
      isElement: boolean;
    }
  ) {
    this.assetMap = assetMap;
    this.src = assetData.src;
    this.assetUrl = assetData.assetUrl;
    this.importedModules = assetData.importedModules;
    this.importedCss = assetData.importedCss;
    this.isElement = assetData.isElement;
  }

  async getCssDeps(): Promise<string[]> {
    const visited = new Set<string>();
    const deps = new Set<string>();
    await this.collectCss(this, deps, visited);
    return Array.from(deps);
  }

  async getJsDeps(): Promise<string[]> {
    const visited = new Set<string>();
    const deps = new Set<string>();
    await this.collectJs(this, deps, visited);
    return Array.from(deps);
  }

  private async collectJs(
    asset: BuildAsset | null,
    urls: Set<string>,
    visited: Set<string>
  ) {
    if (!asset) {
      return;
    }
    if (!asset.src) {
      return;
    }
    if (visited.has(asset.src)) {
      return;
    }
    visited.add(asset.src);
    if (asset.isElement) {
      urls.add(asset.assetUrl);
    }
    await Promise.all(
      asset.importedModules.map(async (src) => {
        const importedAsset = (await this.assetMap.get(src)) as BuildAsset;
        this.collectJs(importedAsset, urls, visited);
      })
    );
  }

  private async collectCss(
    asset: BuildAsset | null,
    urls: Set<string>,
    visited: Set<string>
  ) {
    if (!asset) {
      return;
    }
    if (!asset.src) {
      return;
    }
    if (visited.has(asset.src)) {
      return;
    }
    visited.add(asset.src);
    if (asset.importedCss) {
      asset.importedCss.forEach((cssUrl) => urls.add(cssUrl));
    }
    await Promise.all(
      asset.importedModules.map(async (moduleId) => {
        const importedAsset = (await this.assetMap.get(moduleId)) as BuildAsset;
        this.collectCss(importedAsset, urls, visited);
      })
    );
  }

  toJson() {
    return {
      src: this.src,
      assetUrl: this.assetUrl,
      importedModules: this.importedModules,
      importedCss: this.importedCss,
      isElement: this.isElement,
    };
  }
}
