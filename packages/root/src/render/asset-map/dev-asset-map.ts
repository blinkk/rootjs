import path from 'node:path';
import {ModuleGraph, ModuleNode, searchForWorkspaceRoot} from 'vite';
import {RootConfig} from '../../core/config.js';
import {Asset, AssetMap} from './asset-map.js';

const EMPTY_DEPS: string[] = [];
const JS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

export class DevServerAssetMap implements AssetMap {
  private rootConfig: RootConfig;
  private moduleGraph: ModuleGraph;
  private workspaceRoot?: string;
  private assets = new Map<ModuleNode, DevServerAsset>();

  constructor(rootConfig: RootConfig, moduleGraph: ModuleGraph) {
    this.rootConfig = rootConfig;
    this.moduleGraph = moduleGraph;
  }

  get(src: string): Asset | null {
    const file = path.resolve(this.rootConfig.rootDir, src);

    const viteModules = this.moduleGraph.getModulesByFile(file);
    if (viteModules && viteModules.size > 0) {
      const [viteModule] = viteModules;
      return this.getOrCreateAsset(viteModule, src);
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
    const workspaceRoot = this.getWorkspaceRoot();
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

  /**
   * Returns the memoized `DevServerAsset` for a Vite `ModuleNode`, creating it
   * on first access.
   */
  getOrCreateAsset(viteModule: ModuleNode, src?: string): DevServerAsset {
    let asset = this.assets.get(viteModule);
    if (!asset) {
      const assetSrc =
        src ?? (viteModule.file ? this.filePathToSrc(viteModule.file) : '');
      asset = new DevServerAsset(assetSrc, {
        assetMap: this,
        viteModule: viteModule,
      });
      this.assets.set(viteModule, asset);
    }
    return asset;
  }

  filePathToSrc(file: string) {
    return path.relative(this.rootConfig.rootDir, file);
  }

  private getWorkspaceRoot(): string {
    this.workspaceRoot ??= searchForWorkspaceRoot(this.rootConfig.rootDir);
    return this.workspaceRoot;
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
  private cachedCssDeps?: string[];
  private cachedJsDeps?: string[];

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
    if (this.cachedCssDeps) {
      return this.cachedCssDeps;
    }
    const acyclic = this.collectCssAcyclic(new Set());
    if (acyclic !== null) {
      return acyclic;
    }
    const visited = new Set<string>();
    const deps = new Set<string>();
    this.collectCss(this, deps, visited);
    this.cachedCssDeps = deps.size > 0 ? Array.from(deps) : EMPTY_DEPS;
    return this.cachedCssDeps;
  }

  async getJsDeps(): Promise<string[]> {
    if (this.cachedJsDeps) {
      return this.cachedJsDeps;
    }
    const acyclic = this.collectJsAcyclic(new Set());
    if (acyclic !== null) {
      return acyclic;
    }
    const visited = new Set<string>();
    const deps = new Set<string>();
    this.collectJs(this, deps, visited);
    this.cachedJsDeps = deps.size > 0 ? Array.from(deps) : EMPTY_DEPS;
    return this.cachedJsDeps;
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

  private isElementJs(): boolean {
    if (!this.moduleId.includes('/elements/')) {
      return false;
    }
    const parts = path.parse(this.assetUrl);
    return JS_EXTS.has(parts.ext);
  }

  private isCssEntry(): boolean {
    if (!this.src.endsWith('.scss')) {
      return false;
    }
    const parts = path.parse(this.src);
    return !parts.name.startsWith('_');
  }

  /**
   * Collects JS deps bottom-up while memoizing each acyclic node's result on
   * its `DevServerAsset`. Returns `null` if a cycle is encountered so the
   * caller can fall back to the `visited`-set traversal.
   */
  private collectJsAcyclic(visiting: Set<DevServerAsset>): string[] | null {
    if (this.cachedJsDeps) {
      return this.cachedJsDeps;
    }
    if (!this.moduleId) {
      return EMPTY_DEPS;
    }
    if (visiting.has(this)) {
      return null;
    }
    visiting.add(this);
    const ownUrl = this.isElementJs() ? this.assetUrl : null;
    let deps: Set<string> | null = null;
    let singleChildDeps: string[] | null = null;
    let hasCycle = false;
    for (const viteModule of this.viteModule.importedModules) {
      if (!viteModule.file) {
        continue;
      }
      const importedAsset = this.assetMap.getOrCreateAsset(viteModule);
      const childDeps = importedAsset.collectJsAcyclic(visiting);
      if (childDeps === null) {
        hasCycle = true;
        break;
      }
      if (childDeps.length === 0) {
        continue;
      }
      if (!deps && !ownUrl && !singleChildDeps) {
        singleChildDeps = childDeps;
      } else {
        if (!deps) {
          deps = new Set<string>();
          if (ownUrl) {
            deps.add(ownUrl);
          }
          if (singleChildDeps) {
            for (const url of singleChildDeps) {
              deps.add(url);
            }
            singleChildDeps = null;
          }
        }
        for (const url of childDeps) {
          deps.add(url);
        }
      }
    }
    visiting.delete(this);
    if (hasCycle) {
      return null;
    }
    if (deps) {
      this.cachedJsDeps = Array.from(deps);
    } else if (singleChildDeps) {
      this.cachedJsDeps = singleChildDeps;
    } else if (ownUrl) {
      this.cachedJsDeps = [ownUrl];
    } else {
      this.cachedJsDeps = EMPTY_DEPS;
    }
    return this.cachedJsDeps;
  }

  /**
   * Collects CSS deps bottom-up while memoizing each acyclic node's result on
   * its `DevServerAsset`. Returns `null` if a cycle is encountered so the
   * caller can fall back to the `visited`-set traversal.
   */
  private collectCssAcyclic(visiting: Set<DevServerAsset>): string[] | null {
    if (this.cachedCssDeps) {
      return this.cachedCssDeps;
    }
    if (!this.assetUrl) {
      return EMPTY_DEPS;
    }
    if (visiting.has(this)) {
      return null;
    }
    visiting.add(this);
    const ownUrl = this.isCssEntry() ? this.assetUrl : null;
    let deps: Set<string> | null = null;
    let singleChildDeps: string[] | null = null;
    let hasCycle = false;
    for (const viteModule of this.viteModule.importedModules) {
      if (!viteModule.file) {
        continue;
      }
      const importedAsset = this.assetMap.getOrCreateAsset(viteModule);
      const childDeps = importedAsset.collectCssAcyclic(visiting);
      if (childDeps === null) {
        hasCycle = true;
        break;
      }
      if (childDeps.length === 0) {
        continue;
      }
      if (!deps && !ownUrl && !singleChildDeps) {
        singleChildDeps = childDeps;
      } else {
        if (!deps) {
          deps = new Set<string>();
          if (ownUrl) {
            deps.add(ownUrl);
          }
          if (singleChildDeps) {
            for (const url of singleChildDeps) {
              deps.add(url);
            }
            singleChildDeps = null;
          }
        }
        for (const url of childDeps) {
          deps.add(url);
        }
      }
    }
    visiting.delete(this);
    if (hasCycle) {
      return null;
    }
    if (deps) {
      this.cachedCssDeps = Array.from(deps);
    } else if (singleChildDeps) {
      this.cachedCssDeps = singleChildDeps;
    } else if (ownUrl) {
      this.cachedCssDeps = [ownUrl];
    } else {
      this.cachedCssDeps = EMPTY_DEPS;
    }
    return this.cachedCssDeps;
  }

  private collectJs(
    asset: DevServerAsset | null,
    urls: Set<string>,
    visited: Set<string>
  ) {
    if (!asset || !asset.moduleId || visited.has(asset.moduleId)) {
      return;
    }
    visited.add(asset.moduleId);
    if (asset.cachedJsDeps) {
      for (const url of asset.cachedJsDeps) {
        urls.add(url);
      }
      return;
    }
    if (asset.isElementJs()) {
      urls.add(asset.assetUrl);
    }
    asset.getImportedModules().forEach((viteModule) => {
      if (viteModule.file && viteModule.id && !visited.has(viteModule.id)) {
        const importedAsset = this.assetMap.getOrCreateAsset(viteModule);
        this.collectJs(importedAsset, urls, visited);
      }
    });
  }

  private collectCss(
    asset: DevServerAsset | null,
    urls: Set<string>,
    visited: Set<string>
  ) {
    if (!asset || !asset.assetUrl || visited.has(asset.assetUrl)) {
      return;
    }
    visited.add(asset.assetUrl);
    if (asset.cachedCssDeps) {
      for (const url of asset.cachedCssDeps) {
        urls.add(url);
      }
      return;
    }
    if (asset.isCssEntry()) {
      urls.add(asset.assetUrl);
    }
    asset.getImportedModules().forEach((viteModule) => {
      if (viteModule.file && viteModule.url && !visited.has(viteModule.url)) {
        const importedAsset = this.assetMap.getOrCreateAsset(viteModule);
        this.collectCss(importedAsset, urls, visited);
      }
    });
  }
}
