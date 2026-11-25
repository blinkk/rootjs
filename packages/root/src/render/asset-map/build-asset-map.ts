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
  private resolvedCache: Map<string, BuildAsset | null>;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    this.srcToAsset = new Map();
    this.resolvedCache = new Map();
  }

  get(src: string): Asset | null {
    const asset = this.find(src);
    if (asset) {
      return asset;
    }
    console.log(`could not find build asset: ${src}`);
    return null;
  }

  private find(src: string): BuildAsset | undefined {
    const asset = this.srcToAsset.get(src);
    if (asset) {
      return asset;
    }
    if (src.includes('\\')) {
      const normalizedAsset = this.srcToAsset.get(src.replace(/\\/g, '/'));
      if (normalizedAsset) {
        return normalizedAsset;
      }
    }
    const cached = this.resolvedCache.get(src);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    // Try resolving the realpath of the asset, following symlinks.
    const realSrc = realPathRelativeTo(this.rootConfig.rootDir, src);
    if (realSrc !== src) {
      const realAsset = this.srcToAsset.get(realSrc);
      if (realAsset) {
        this.resolvedCache.set(src, realAsset);
        return realAsset;
      }
    }
    this.resolvedCache.set(src, null);
    return undefined;
  }

  private add(asset: BuildAsset) {
    this.srcToAsset.set(asset.src, asset);
    this.resolvedCache.delete(asset.src);
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
      // `realPathRelativeTo()` returns a `path.relative()` result with
      // OS-specific separators; normalize to forward slashes to match the
      // manifest keys (and `relPath` above) on Windows/symlinked setups.
      const realPath = realPathRelativeTo(rootConfig.rootDir, relPath).replace(
        /\\/g,
        '/'
      );
      const candidateKeys = [relPath, realPath];
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
 * Returns the realpath of a src file, relative to the rootDir, normalized to
 * POSIX forward slashes to match Vite manifest keys.
 */
function realPathRelativeTo(rootDir: string, src: string) {
  const fullPath = path.resolve(rootDir, src);
  if (!fs.existsSync(fullPath)) {
    return src.replace(/\\/g, '/');
  }
  const realpath = fs.realpathSync(fullPath);
  return path.relative(rootDir, realpath).replace(/\\/g, '/');
}

/**
 * Returns true if a serving URL points to a JS module.
 */
function isJsAssetUrl(assetUrl: string) {
  return assetUrl.endsWith('.js') || assetUrl.endsWith('.mjs');
}

export class BuildAsset {
  src: string;
  assetUrl: string;
  private assetMap: BuildAssetMap;
  private importedModules: string[];
  private importedCss: string[];
  isElement: boolean;
  private cssDeps?: string[];
  private jsDeps?: string[];
  private modulePreloadDeps?: string[];

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
    if (!this.cssDeps) {
      const deps = new Set<string>();
      this.collectCss(deps);
      this.cssDeps = Array.from(deps);
    }
    return this.cssDeps.slice();
  }

  async getJsDeps(): Promise<string[]> {
    if (!this.jsDeps) {
      const deps = new Set<string>();
      this.collectJs(deps);
      this.jsDeps = Array.from(deps);
    }
    return this.jsDeps.slice();
  }

  async getModulePreloadDeps(): Promise<string[]> {
    if (!this.modulePreloadDeps) {
      const deps = new Set<string>();
      this.collectModulePreload(deps);
      this.modulePreloadDeps = Array.from(deps);
    }
    return this.modulePreloadDeps.slice();
  }

  /**
   * Walks the import graph breadth-first from `root`, calling `visit` once per
   * reachable asset. Breadth-first order keeps the collected URLs in a stable
   * order where an importer's deps are listed before its imports' deps, which
   * matters for the CSS cascade.
   */
  private walkImports(root: BuildAsset, visit: (asset: BuildAsset) => void) {
    const visited = new Set<string>();
    const queue: Array<BuildAsset | null> = [root];
    for (let i = 0; i < queue.length; i++) {
      const asset = queue[i];
      if (!asset || !asset.src || visited.has(asset.src)) {
        continue;
      }
      visited.add(asset.src);
      visit(asset);
      for (const src of asset.importedModules) {
        queue.push(this.assetMap.get(src) as BuildAsset | null);
      }
    }
  }

  private collectJs(urls: Set<string>) {
    this.walkImports(this, (asset) => {
      if (asset.isElement) {
        urls.add(asset.assetUrl);
      }
    });
  }

  /**
   * Walks this asset's transitive imports breadth-first, collecting the JS
   * chunk URL of every module along the way.
   */
  private collectModulePreload(urls: Set<string>) {
    // Seed `visited` with this asset so that the walk starts at the imported
    // modules and this asset's own URL is left out of the results.
    const visited = new Set<string>([this.src]);
    const queue: string[] = [];
    const enqueue = (srcs: string[]) => {
      for (const src of srcs) {
        if (!visited.has(src)) {
          visited.add(src);
          queue.push(src);
        }
      }
    };
    enqueue(this.importedModules);
    for (let i = 0; i < queue.length; i++) {
      const asset = this.assetMap.get(queue[i]) as BuildAsset | null;
      if (!asset || !asset.src) {
        continue;
      }
      // Route files have no asset URL of their own, and CSS deps are
      // injected as stylesheets rather than preloaded.
      if (asset.assetUrl && isJsAssetUrl(asset.assetUrl)) {
        urls.add(asset.assetUrl);
      }
      enqueue(asset.importedModules);
    }
  }

  private collectCss(urls: Set<string>) {
    this.walkImports(this, (asset) => {
      if (asset.importedCss) {
        for (const cssUrl of asset.importedCss) {
          urls.add(cssUrl);
        }
      }
    });
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
