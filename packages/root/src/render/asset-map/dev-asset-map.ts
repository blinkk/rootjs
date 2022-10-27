import path from 'node:path';
import {ModuleGraph, ModuleNode} from 'vite';
import {Asset, AssetMap} from './asset-map';

export class DevServerAssetMap implements AssetMap {
  private moduleGraph: ModuleGraph;

  constructor(moduleGraph: ModuleGraph) {
    this.moduleGraph = moduleGraph;
  }

  async get(moduleId: string): Promise<Asset | null> {
    const viteModule = await this.moduleGraph.getModuleByUrl(moduleId);
    if (!viteModule || !viteModule.id) {
      // On dev, in some cases the module doesn't make it into the module graph
      // so return a generic asset.
      return {
        moduleId: moduleId,
        assetUrl: moduleId,
        getCssDeps: async () => [],
        getJsDeps: async () => [moduleId],
      };
    }
    return new DevServerAsset(this, viteModule);
  }
}

export class DevServerAsset implements Asset {
  moduleId: string;
  assetUrl: string;
  private assetMap: AssetMap;
  private viteModule: ModuleNode;

  constructor(assetMap: AssetMap, viteModule: ModuleNode) {
    this.assetMap = assetMap;
    this.viteModule = viteModule;
    this.moduleId = this.viteModule.id!;
    this.assetUrl = this.viteModule.url;
  }

  async getCssDeps(): Promise<string[]> {
    const visited = new Set<string>();
    const deps = new Set<string>();
    this.collectCss(this, deps, visited);
    return Array.from(deps);
  }

  async getJsDeps(): Promise<string[]> {
    const visited = new Set<string>();
    const deps = new Set<string>();
    this.collectJs(this, deps, visited);
    return Array.from(deps);
  }

  getImportedModules() {
    return this.viteModule.importedModules;
  }

  private collectJs(
    asset: DevServerAsset | null,
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
    asset.getImportedModules().forEach((viteModule) => {
      if (viteModule.id) {
        const importedAsset = new DevServerAsset(this.assetMap, viteModule);
        this.collectJs(importedAsset, urls, visited);
      }
    });
  }

  private collectCss(
    asset: DevServerAsset | null,
    urls: Set<string>,
    visited: Set<string>
  ) {
    if (!asset) {
      return;
    }
    if (!asset.assetUrl) {
      return;
    }
    if (visited.has(asset.assetUrl)) {
      return;
    }
    visited.add(asset.assetUrl);
    if (asset.moduleId.endsWith('.scss')) {
      const parts = path.parse(asset.assetUrl);
      if (!parts.name.startsWith('_')) {
        urls.add(asset.assetUrl);
      }
    }
    asset.getImportedModules().forEach((viteModule) => {
      if (viteModule.id) {
        const importedAsset = new DevServerAsset(this.assetMap, viteModule);
        this.collectCss(importedAsset, urls, visited);
      }
    });
  }
}
