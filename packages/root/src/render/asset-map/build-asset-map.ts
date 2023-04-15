import fs from 'node:fs';
import path from 'node:path';

import {Manifest} from 'vite';

import {RootConfig} from '../../core/config';
import {ElementGraph} from '../../node/element-graph';
import {isJsFile} from '../../utils/fsutils';

import {Asset, AssetMap} from './asset-map';

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
    elementsGraph: ElementGraph
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
      // NOTES(stevenle): routes/ files are included in the manifest so for
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
