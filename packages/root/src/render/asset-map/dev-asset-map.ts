import path from 'node:path';
import {ModuleGraph, ModuleNode, searchForWorkspaceRoot} from 'vite';
import {RootConfig} from '../../core/config.js';
import {Asset, AssetMap} from './asset-map.js';

export class DevServerAssetMap implements AssetMap {
  private rootConfig: RootConfig;
  private moduleGraph: ModuleGraph;

  constructor(rootConfig: RootConfig, moduleGraph: ModuleGraph) {
    this.rootConfig = rootConfig;
    this.moduleGraph = moduleGraph;
  }

  get(src: string): Asset | null {
    const file = path.resolve(this.rootConfig.rootDir, src);

    const viteModules = this.moduleGraph.getModulesByFile(file);
    if (viteModules && viteModules.size > 0) {
      const [viteModule] = viteModules;
      return new DevServerAsset(src, {
        assetMap: this,
        viteModule: viteModule,
      });
    }

    // On dev, in some cases the module doesn't make it into the module graph
    // so return a generic asset.
    if (directoryContains(this.rootConfig.rootDir, file)) {
      const assetUrl = file.slice(this.rootConfig.rootDir.length);
      return {
        src: src,
        assetUrl: assetUrl,
        getCssDeps: async () => [],
        getJsDeps: async () => [assetUrl],
        getModulePreloadDeps: async () => [],
      };
    }
    const workspaceRoot = searchForWorkspaceRoot(this.rootConfig.rootDir);
    if (directoryContains(workspaceRoot, file)) {
      const assetUrl = `/@fs/${file}`;
      return {
        src: src,
        assetUrl: assetUrl,
        getCssDeps: async () => [],
        getJsDeps: async () => [assetUrl],
        getModulePreloadDeps: async () => [],
      };
    }

    console.log(`could not find asset in asset map: ${src}`);
    return null;
  }

  filePathToSrc(file: string) {
    return path.relative(this.rootConfig.rootDir, file);
  }
}

/** Returns true when a path is contained by a directory. */
function directoryContains(dir: string, file: string): boolean {
  const relativePath = path.relative(dir, file);
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`);
}

export class DevServerAsset implements Asset {
  src: string;
  moduleId: string;
  assetUrl: string;
  private assetMap: DevServerAssetMap;
  private viteModule: ModuleNode;

  constructor(
    src: string,
    options: {
      assetMap: DevServerAssetMap;
      viteModule: ModuleNode;
    }
  ) {
    this.src = src;
    this.assetMap = options.assetMap;
    this.viteModule = options.viteModule;
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

  /**
   * The dev server serves modules unbundled and unhashed, so there are no
   * shared chunks to preload. Returning an empty list keeps
   * `<link rel="modulepreload">` tags out of the dev server's HTML.
   */
  async getModulePreloadDeps(): Promise<string[]> {
    return [];
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
      if (viteModule.file) {
        const src = this.assetMap.filePathToSrc(viteModule.file);
        const importedAsset = new DevServerAsset(src, {
          assetMap: this.assetMap,
          viteModule: viteModule,
        });
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
    if (asset.src.endsWith('.scss')) {
      const parts = path.parse(asset.src);
      if (!parts.name.startsWith('_')) {
        urls.add(asset.assetUrl);
      }
    }
    asset.getImportedModules().forEach((viteModule) => {
      if (viteModule.file) {
        const src = this.assetMap.filePathToSrc(viteModule.file);
        const importedAsset = new DevServerAsset(src, {
          assetMap: this.assetMap,
          viteModule: viteModule,
        });
        this.collectCss(importedAsset, urls, visited);
      }
    });
  }
}
