import path from 'path';
import {Manifest, ManifestChunk} from 'vite';
import {Asset, AssetMap} from './asset-map';

type BuildAssetManifest = Record<
  string,
  {
    moduleId: string;
    assetUrl: string;
    importedModules: string[];
    importedCss: string[];
  }
>;

export class BuildAssetMap implements AssetMap {
  private manifest: Manifest;
  private moduleIdToAsset: Map<string, BuildAsset>;

  constructor(manifest: Manifest) {
    this.manifest = manifest;
    this.moduleIdToAsset = new Map();
    Object.keys(this.manifest).forEach((manifestKey) => {
      const moduleId = `/${manifestKey}`;
      this.moduleIdToAsset.set(
        moduleId,
        new BuildAsset(this, moduleId, this.manifest[manifestKey])
      );
    });
  }

  async get(moduleId: string): Promise<Asset | null> {
    return this.moduleIdToAsset.get(moduleId) || null;
  }

  toJson(): BuildAssetManifest {
    const result: BuildAssetManifest = {};
    for (const moduleId of this.moduleIdToAsset.keys()) {
      result[moduleId] = this.moduleIdToAsset.get(moduleId)!.toJson();
    }
    return result;
  }
}

export class BuildAsset {
  moduleId: string;
  assetUrl: string;
  private assetMap: BuildAssetMap;
  private manifestData: ManifestChunk;
  private importedModules: string[];
  private importedCss: string[];

  constructor(
    assetMap: BuildAssetMap,
    moduleId: string,
    manifestData: ManifestChunk
  ) {
    this.assetMap = assetMap;
    this.moduleId = moduleId;
    this.manifestData = manifestData;
    this.assetUrl = `/${manifestData.file}`;
    this.importedModules = (this.manifestData.imports || []).map(
      (relPath) => `/${relPath}`
    );
    this.importedCss = (this.manifestData.css || []).map(
      (relPath) => `/${relPath}`
    );
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
    };
  }
}
