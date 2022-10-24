import {Manifest} from 'vite';
import {Asset, AssetMap} from './asset-map';

export type BuildAssetManifest = Record<
  string,
  {
    moduleId: string;
    assetUrl: string;
    importedModules: string[];
    importedCss: string[];
    isElement: boolean;
  }
>;

export class BuildAssetMap implements AssetMap {
  private moduleIdToAsset: Map<string, BuildAsset>;

  constructor() {
    this.moduleIdToAsset = new Map();
  }

  async get(moduleId: string): Promise<Asset | null> {
    return this.moduleIdToAsset.get(moduleId) || null;
  }

  private add(asset: BuildAsset) {
    this.moduleIdToAsset.set(asset.moduleId, asset);
  }

  toJson(): BuildAssetManifest {
    const result: BuildAssetManifest = {};
    for (const moduleId of this.moduleIdToAsset.keys()) {
      result[moduleId] = this.moduleIdToAsset.get(moduleId)!.toJson();
    }
    return result;
  }

  static fromViteManifest(
    viteManifest: Manifest,
    elementMap: Record<string, string>
  ) {
    const assetMap = new BuildAssetMap();

    const elementModuleIds = new Set();
    Object.values(elementMap).forEach((moduleId) =>
      elementModuleIds.add(moduleId)
    );

    Object.keys(viteManifest).forEach((manifestKey) => {
      const moduleId = `/${manifestKey}`;
      const manifestChunk = viteManifest[manifestKey];
      const isElement = elementModuleIds.has(moduleId);
      const assetData = {
        moduleId,
        assetUrl: `/${manifestChunk.file}`,
        importedModules: (manifestChunk.imports || []).map(
          (relPath) => `/${relPath}`
        ),
        importedCss: (manifestChunk.css || []).map((relPath) => `/${relPath}`),
        isElement: isElement,
      };
      assetMap.add(new BuildAsset(assetMap, assetData));
    });
    return assetMap;
  }

  static fromRootManifest(rootManifest: BuildAssetManifest) {
    const assetMap = new BuildAssetMap();
    Object.keys(rootManifest).forEach((moduleId) => {
      const assetData = rootManifest[moduleId];
      assetMap.add(new BuildAsset(assetMap, assetData));
    });
    return assetMap;
  }
}

export class BuildAsset {
  moduleId: string;
  assetUrl: string;
  private assetMap: BuildAssetMap;
  private importedModules: string[];
  private importedCss: string[];
  isElement: boolean;

  constructor(
    assetMap: BuildAssetMap,
    assetData: {
      moduleId: string;
      assetUrl: string;
      importedModules: string[];
      importedCss: string[];
      isElement: boolean;
    }
  ) {
    this.assetMap = assetMap;
    this.moduleId = assetData.moduleId;
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
    if (!asset.moduleId) {
      return;
    }
    if (visited.has(asset.moduleId)) {
      return;
    }
    visited.add(asset.moduleId);
    if (asset.isElement) {
      urls.add(asset.assetUrl);
    }
    await Promise.all(
      asset.importedModules.map(async (moduleId) => {
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
      moduleId: this.moduleId,
      assetUrl: this.assetUrl,
      importedModules: this.importedModules,
      importedCss: this.importedCss,
      isElement: this.isElement,
    };
  }
}
