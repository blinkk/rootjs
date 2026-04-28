import path from 'node:path';
import glob from 'tiny-glob';
import {RootConfig} from '../core/config.js';
import {Pod, PodConfig} from '../core/pod.js';
import {Plugin} from '../core/plugin.js';
import {isDirectory, isJsFile} from '../utils/fsutils.js';

export interface ResolvedPodRoute {
  filePath: string;
  relPath: string;
  routePath: string;
}

export interface ResolvedPodCollection {
  filePath: string;
  relPath: string;
  id: string;
}

export interface ResolvedPod {
  name: string;
  enabled: boolean;
  mount: string;
  priority: number;
  routesDir?: string;
  elementsDirs: string[];
  bundlesDir?: string;
  collectionsDir?: string;
  translationsDir?: string;
  routeFiles: ResolvedPodRoute[];
  bundleFiles: string[];
  collectionFiles: ResolvedPodCollection[];
  translationFiles: Array<{locale: string; filePath: string}>;
  config: PodConfig;
}

let cachedPods: ResolvedPod[] | null = null;

export function invalidatePodCache() {
  cachedPods = null;
}

export async function collectPods(rootConfig: RootConfig): Promise<ResolvedPod[]> {
  if (cachedPods) {
    return cachedPods;
  }

  const plugins = rootConfig.plugins || [];
  const userPodConfigs = rootConfig.pods || {};

  const rawPods = await resolvePluginPods(plugins, rootConfig);
  const resolved: ResolvedPod[] = [];

  const seenNames = new Set<string>();
  for (const pod of rawPods) {
    if (seenNames.has(pod.name)) {
      throw new Error(
        `Duplicate pod name: "${pod.name}". Each pod must have a unique name.`
      );
    }
    seenNames.add(pod.name);

    const userConfig = userPodConfigs[pod.name] || {};
    if (userConfig.enabled === false) {
      continue;
    }

    const resolvedPod = await resolvePod(pod, userConfig, rootConfig);
    resolved.push(resolvedPod);
  }

  validateCollectionIds(resolved, rootConfig);

  cachedPods = resolved;
  return resolved;
}

async function resolvePluginPods(
  plugins: Plugin[],
  rootConfig: RootConfig
): Promise<Pod[]> {
  const pods: Pod[] = [];
  for (const plugin of plugins) {
    if (!plugin.pod) {
      continue;
    }
    if (typeof plugin.pod === 'function') {
      const result = await plugin.pod({rootConfig});
      pods.push(result);
    } else if (Array.isArray(plugin.pod)) {
      pods.push(...plugin.pod);
    } else {
      pods.push(plugin.pod);
    }
  }
  return pods;
}

async function resolvePod(
  pod: Pod,
  userConfig: PodConfig,
  rootConfig: RootConfig
): Promise<ResolvedPod> {
  const mount = normalizeMountPath(userConfig.mount ?? pod.mount ?? '/');
  const priority = userConfig.priority ?? pod.priority ?? 0;

  const routeFiles = pod.routesDir
    ? await scanRouteFiles(pod.routesDir, mount, userConfig, rootConfig)
    : [];

  const bundleFiles = pod.bundlesDir
    ? await scanBundleFiles(pod.bundlesDir)
    : [];

  const collectionFiles = pod.collectionsDir
    ? await scanCollectionFiles(pod.collectionsDir, userConfig)
    : [];

  const translationFiles = pod.translationsDir
    ? await scanTranslationFiles(pod.translationsDir)
    : [];

  return {
    name: pod.name,
    enabled: true,
    mount,
    priority,
    routesDir: pod.routesDir,
    elementsDirs: pod.elementsDirs || [],
    bundlesDir: pod.bundlesDir,
    collectionsDir: pod.collectionsDir,
    translationsDir: pod.translationsDir,
    routeFiles,
    bundleFiles,
    collectionFiles,
    translationFiles,
    config: userConfig,
  };
}

async function scanRouteFiles(
  routesDir: string,
  mount: string,
  userConfig: PodConfig,
  rootConfig: RootConfig
): Promise<ResolvedPodRoute[]> {
  if (!(await isDirectory(routesDir))) {
    return [];
  }

  const files = await glob('**/*', {cwd: routesDir});
  const routes: ResolvedPodRoute[] = [];
  const excludePatterns = userConfig.routes?.exclude || [];

  for (const file of files) {
    const parts = path.parse(file);
    if (parts.name.startsWith('_') || !isJsFile(parts.base)) {
      continue;
    }

    if (shouldExclude(file, excludePatterns)) {
      continue;
    }

    const filePath = path.join(routesDir, file);
    let relativeRoutePath = '/' + file.replace(/\\/g, '/');
    const routeParts = path.parse(relativeRoutePath);
    if (routeParts.name === 'index') {
      relativeRoutePath = routeParts.dir;
    } else {
      relativeRoutePath = path.join(routeParts.dir, routeParts.name);
    }
    relativeRoutePath = relativeRoutePath.replace(/\\/g, '/');

    const routePath = normalizeRoutePath(mount, relativeRoutePath, rootConfig);

    routes.push({filePath, relPath: file, routePath});
  }

  return routes;
}

async function scanBundleFiles(bundlesDir: string): Promise<string[]> {
  if (!(await isDirectory(bundlesDir))) {
    return [];
  }
  const files = await glob('*', {cwd: bundlesDir});
  return files
    .filter((file) => isJsFile(path.parse(file).base))
    .map((file) => path.join(bundlesDir, file));
}

async function scanCollectionFiles(
  collectionsDir: string,
  userConfig: PodConfig
): Promise<ResolvedPodCollection[]> {
  if (!(await isDirectory(collectionsDir))) {
    return [];
  }
  const files = await glob('**/*.schema.ts', {cwd: collectionsDir});
  const excludeIds = new Set(userConfig.collections?.exclude || []);
  const renameMap = userConfig.collections?.rename || {};
  const collections: ResolvedPodCollection[] = [];

  for (const file of files) {
    const parts = path.parse(file);
    const rawId = parts.name.replace('.schema', '');
    if (excludeIds.has(rawId)) {
      continue;
    }
    const id = renameMap[rawId] || rawId;
    collections.push({
      filePath: path.join(collectionsDir, file),
      relPath: file,
      id,
    });
  }

  return collections;
}

async function scanTranslationFiles(
  translationsDir: string
): Promise<Array<{locale: string; filePath: string}>> {
  if (!(await isDirectory(translationsDir))) {
    return [];
  }
  const files = await glob('*.json', {cwd: translationsDir});
  return files.map((file) => ({
    locale: path.parse(file).name,
    filePath: path.join(translationsDir, file),
  }));
}

function validateCollectionIds(
  pods: ResolvedPod[],
  rootConfig: RootConfig
) {
  const seenIds = new Map<string, string>();

  for (const pod of pods) {
    for (const col of pod.collectionFiles) {
      const existing = seenIds.get(col.id);
      if (existing) {
        throw new Error(
          `Collection "${col.id}" is defined by both "${existing}" and ` +
            `"${pod.name}". Use rootConfig.pods['${pod.name}'].collections.rename ` +
            `to disambiguate.`
        );
      }
      seenIds.set(col.id, pod.name);
    }
  }
}

function normalizeMountPath(mount: string): string {
  if (!mount.startsWith('/')) {
    mount = '/' + mount;
  }
  if (mount.endsWith('/') && mount.length > 1) {
    mount = mount.slice(0, -1);
  }
  return mount;
}

function normalizeRoutePath(
  mount: string,
  relativeRoutePath: string,
  rootConfig: RootConfig
): string {
  const basePath = rootConfig.base || '/';
  let fullPath: string;
  if (mount === '/') {
    fullPath = relativeRoutePath || '/';
  } else {
    fullPath = mount + (relativeRoutePath || '');
  }

  if (basePath !== '/') {
    const base = basePath.replace(/^\/|\/$/g, '');
    fullPath = `/${base}${fullPath}`;
  }

  // Collapse multiple slashes.
  fullPath = fullPath.replace(/\/+/g, '/');
  if (!fullPath.startsWith('/')) {
    fullPath = '/' + fullPath;
  }
  return fullPath || '/';
}

function shouldExclude(
  filePath: string,
  patterns: (string | RegExp)[]
): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (filePath.includes(pattern)) {
        return true;
      }
    } else {
      if (pattern.test(filePath)) {
        return true;
      }
    }
  }
  return false;
}
