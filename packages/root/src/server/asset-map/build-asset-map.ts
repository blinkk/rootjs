import path from 'path';
import {Asset, AssetMap} from './asset-map';

export class BuildAssetMap implements AssetMap {
  private moduleIdToAsset: Map<string, BuildAsset>;

  constructor() {
    this.moduleIdToAsset = new Map();
  }

  async get(moduleId: string): Promise<Asset | null> {
    return this.moduleIdToAsset.get(moduleId) || null;
  }

  add(assetData: {
    moduleId: string;
    assetUrl: string;
    importedModules: string[];
    importedCss: string[];
  }) {
    const asset = new BuildAsset(
      this,
      assetData.moduleId,
      assetData.assetUrl,
      assetData.importedModules,
      assetData.importedCss
    );
    this.moduleIdToAsset.set(assetData.moduleId, asset);
  }
}

export class BuildAsset {
  private assetMap: BuildAssetMap;
  moduleId: string;
  assetUrl: string;
  private importedModules: string[];
  private importedCss: string[];

  constructor(
    assetMap: BuildAssetMap,
    moduleId: string,
    assetUrl: string,
    importedModules: string[],
    importedCss: string[]
  ) {
    this.assetMap = assetMap;
    this.moduleId = moduleId;
    this.assetUrl = assetUrl;
    this.importedModules = importedModules;
    this.importedCss = importedCss;
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
    if (!asset.moduleId) {
      return;
    }
    if (visited.has(asset.moduleId)) {
      return;
    }
    visited.add(asset.moduleId);
    const parts = path.parse(asset.assetUrl);
    if (
      ['.js', '.jsx', '.ts', '.tsx'].includes(parts.ext) &&
      asset.moduleId.includes('/elements/')
    ) {
      urls.add(asset.assetUrl);
    }
    await Promise.all(
      asset.importedModules.map(async moduleId => {
        const importedAsset = (await this.assetMap.get(moduleId)) as BuildAsset;
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
    if (!asset.assetUrl) {
      return;
    }
    if (visited.has(asset.moduleId)) {
      return;
    }
    visited.add(asset.moduleId);
    if (asset.moduleId.endsWith('.scss')) {
      const parts = path.parse(asset.assetUrl);
      if (!parts.name.startsWith('_')) {
        urls.add(asset.assetUrl);
      }
    }
    if (asset.importedCss) {
      asset.importedCss.forEach(cssUrl => urls.add(cssUrl));
    }
    await Promise.all(
      asset.importedModules.map(async moduleId => {
        const importedAsset = (await this.assetMap.get(moduleId)) as BuildAsset;
        this.collectCss(importedAsset, urls, visited);
      })
    );
  }
}
