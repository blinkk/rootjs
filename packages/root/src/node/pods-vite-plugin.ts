import fs from 'node:fs';
import path from 'node:path';
import glob from 'tiny-glob';
import type {Plugin as VitePlugin} from 'vite';
import {RootConfig} from '../core/config.js';
import {isDirectory, isJsFile} from '../utils/fsutils.js';
import {collectPods, invalidatePodCache, ResolvedPod} from './pod-collector.js';

export const VIRTUAL_ROUTES_ID = 'virtual:root/routes';
export const VIRTUAL_SCHEMAS_ID = 'virtual:root/schemas';
export const VIRTUAL_TRANSLATIONS_ID = 'virtual:root/translations';

const RESOLVED_VIRTUAL_ROUTES = '\0' + VIRTUAL_ROUTES_ID;
const RESOLVED_VIRTUAL_SCHEMAS = '\0' + VIRTUAL_SCHEMAS_ID;
const RESOLVED_VIRTUAL_TRANSLATIONS = '\0' + VIRTUAL_TRANSLATIONS_ID;

export function rootPodsVitePlugin(rootConfig: RootConfig): VitePlugin {
  let podsPromise: Promise<ResolvedPod[]> | null = null;

  const getPods = () => {
    if (!podsPromise) {
      podsPromise = collectPods(rootConfig);
    }
    return podsPromise;
  };

  return {
    name: 'root:pods',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_ROUTES_ID) return RESOLVED_VIRTUAL_ROUTES;
      if (id === VIRTUAL_SCHEMAS_ID) return RESOLVED_VIRTUAL_SCHEMAS;
      if (id === VIRTUAL_TRANSLATIONS_ID) return RESOLVED_VIRTUAL_TRANSLATIONS;
      return null;
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_ROUTES) {
        return buildRoutesModule(rootConfig, await getPods());
      }
      if (id === RESOLVED_VIRTUAL_SCHEMAS) {
        return buildSchemasModule(rootConfig, await getPods());
      }
      if (id === RESOLVED_VIRTUAL_TRANSLATIONS) {
        return buildTranslationsModule(rootConfig, await getPods());
      }
      return null;
    },

    configureServer(server) {
      const watchDirs: string[] = [];
      getPods().then((pods) => {
        for (const pod of pods) {
          if (pod.routesDir) watchDirs.push(pod.routesDir);
          if (pod.collectionsDir) watchDirs.push(pod.collectionsDir);
          if (pod.translationsDir) watchDirs.push(pod.translationsDir);
          if (pod.bundlesDir) watchDirs.push(pod.bundlesDir);
          for (const dir of pod.elementsDirs) {
            watchDirs.push(dir);
          }
        }
        for (const dir of watchDirs) {
          server.watcher.add(dir);
        }
      });

      const invalidateVirtualModules = () => {
        invalidatePodCache();
        podsPromise = null;
        const mods = [
          RESOLVED_VIRTUAL_ROUTES,
          RESOLVED_VIRTUAL_SCHEMAS,
          RESOLVED_VIRTUAL_TRANSLATIONS,
        ];
        for (const modId of mods) {
          const mod = server.moduleGraph.getModuleById(modId);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
        server.ws.send({type: 'full-reload'});
      };

      server.watcher.on('add', (filePath) => {
        if (isInPodDir(filePath, watchDirs)) {
          invalidateVirtualModules();
        }
      });
      server.watcher.on('unlink', (filePath) => {
        if (isInPodDir(filePath, watchDirs)) {
          invalidateVirtualModules();
        }
      });
    },
  };
}

function isInPodDir(filePath: string, watchDirs: string[]): boolean {
  for (const dir of watchDirs) {
    if (filePath.startsWith(dir)) {
      return true;
    }
  }
  return false;
}

async function buildRoutesModule(
  rootConfig: RootConfig,
  pods: ResolvedPod[]
): Promise<string> {
  const rootDir = rootConfig.rootDir;
  const imports: string[] = [];
  const userEntries: string[] = [];
  const podEntries: string[] = [];
  let idx = 0;

  // User project routes.
  const routesDir = path.join(rootDir, 'routes');
  if (await isDirectory(routesDir)) {
    const files = await glob('**/*', {cwd: routesDir});
    for (const file of files) {
      const parts = path.parse(file);
      if (parts.name.startsWith('_') || !isJsFile(parts.base)) {
        continue;
      }
      const modulePath = `/routes/${file.replace(/\\/g, '/')}`;
      const varName = `_r${idx++}`;
      imports.push(`import * as ${varName} from '${modulePath}';`);
      userEntries.push(`  '${modulePath}': ${varName},`);
    }
  }

  // Pod routes.
  for (const pod of pods) {
    for (const route of pod.routeFiles) {
      const varName = `_r${idx++}`;
      imports.push(`import * as ${varName} from '${route.filePath}';`);
      podEntries.push(
        `  '${route.filePath}': {module: ${varName}, podName: ${JSON.stringify(pod.name)}, routePath: ${JSON.stringify(route.routePath)}, src: ${JSON.stringify(`pod/${pod.name}/${route.relPath}`)}},`
      );
    }
  }

  return [
    ...imports,
    '',
    'export const ROUTE_MODULES = {',
    ...userEntries,
    '};',
    '',
    'export const POD_ROUTE_MODULES = {',
    ...podEntries,
    '};',
  ].join('\n');
}

async function buildSchemasModule(
  rootConfig: RootConfig,
  pods: ResolvedPod[]
): Promise<string> {
  const rootDir = rootConfig.rootDir;
  const imports: string[] = [];
  const entries: string[] = [];
  let idx = 0;

  // User project collections — these win over pod collections.
  const userCollectionIds = new Set<string>();
  const collectionsDir = path.join(rootDir, 'collections');
  if (await isDirectory(collectionsDir)) {
    const files = await glob('**/*.schema.ts', {cwd: collectionsDir});
    for (const file of files) {
      const parts = path.parse(file);
      const id = parts.name.replace('.schema', '');
      userCollectionIds.add(id);
      const modulePath = `/collections/${file.replace(/\\/g, '/')}`;
      const varName = `_s${idx++}`;
      imports.push(`import * as ${varName} from '${modulePath}';`);
      entries.push(`  '${modulePath}': ${varName},`);
    }
  }

  // Also scan root-level schema files that match the existing patterns
  // (e.g. /templates/**/*.schema.ts), excluding known non-collection dirs.
  const rootSchemaFiles = await scanRootSchemaFiles(rootDir);
  for (const file of rootSchemaFiles) {
    const modulePath = `/${file.replace(/\\/g, '/')}`;
    // Skip if already in collections.
    if (modulePath.startsWith('/collections/')) continue;
    const varName = `_s${idx++}`;
    imports.push(`import * as ${varName} from '${modulePath}';`);
    entries.push(`  '${modulePath}': ${varName},`);
  }

  // Pod collections — user project wins on id collision.
  for (const pod of pods) {
    for (const col of pod.collectionFiles) {
      if (userCollectionIds.has(col.id)) {
        continue;
      }
      const varName = `_s${idx++}`;
      imports.push(`import * as ${varName} from '${col.filePath}';`);
      const key = `/collections/${col.id}.schema.ts`;
      entries.push(`  '${key}': ${varName},`);
    }
  }

  return [
    ...imports,
    '',
    'export const SCHEMA_MODULES = {',
    ...entries,
    '};',
  ].join('\n');
}

/**
 * Top-level directories skipped by `scanRootSchemaFiles()`.
 * `collections` is excluded because `buildSchemasModule()` scans top-level
 * `collections/` separately to track `userCollectionIds` for pod precedence,
 * avoiding scanning `collections/` twice.
 */
const ROOT_SCHEMA_EXCLUDE_DIRS = new Set([
  'appengine',
  'collections',
  'dist',
  'functions',
  'gae',
  'node_modules',
]);

/**
 * Recursively scans a Root.js project directory for `*.schema.ts` files,
 * pruning excluded and hidden directories before descending into them.
 */
export async function scanRootSchemaFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, relDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, {withFileTypes: true});
    } catch {
      return;
    }
    const subdirs: Array<{fullPath: string; relPath: string}> = [];
    for (const entry of entries) {
      const name = entry.name;
      // Skip hidden files and directories (matching tiny-glob's default).
      if (name.startsWith('.')) {
        continue;
      }
      const relPath = relDir ? `${relDir}/${name}` : name;
      if (entry.isDirectory()) {
        if (
          (!relDir && ROOT_SCHEMA_EXCLUDE_DIRS.has(name)) ||
          name === 'node_modules'
        ) {
          continue;
        }
        subdirs.push({fullPath: path.join(dir, name), relPath});
      } else if (name.endsWith('.schema.ts')) {
        results.push(relPath);
      }
    }
    if (subdirs.length > 0) {
      await Promise.all(subdirs.map((sub) => walk(sub.fullPath, sub.relPath)));
    }
  }

  await walk(rootDir, '');
  results.sort();
  return results;
}

async function buildTranslationsModule(
  rootConfig: RootConfig,
  pods: ResolvedPod[]
): Promise<string> {
  const rootDir = rootConfig.rootDir;
  const imports: string[] = [];
  const entries: string[] = [];
  let idx = 0;

  // User translations take precedence.
  const userLocales = new Set<string>();
  const translationsDir = path.join(rootDir, 'translations');
  if (await isDirectory(translationsDir)) {
    const files = await glob('*.json', {cwd: translationsDir});
    for (const file of files) {
      const locale = path.parse(file).name;
      userLocales.add(locale);
      const modulePath = `/translations/${file}`;
      const varName = `_t${idx++}`;
      imports.push(`import ${varName} from '${modulePath}';`);
      entries.push(`  '${modulePath}': {default: ${varName}},`);
    }
  }

  // Pod translations.
  for (const pod of pods) {
    for (const t of pod.translationFiles) {
      const varName = `_t${idx++}`;
      imports.push(`import ${varName} from '${t.filePath}';`);
      // Use a synthetic key that includes the pod name for merging.
      const key = `/translations/pod:${pod.name}:${t.locale}.json`;
      entries.push(`  '${key}': {default: ${varName}},`);
    }
  }

  return [
    ...imports,
    '',
    'export const TRANSLATION_MODULES = {',
    ...entries,
    '};',
  ].join('\n');
}
