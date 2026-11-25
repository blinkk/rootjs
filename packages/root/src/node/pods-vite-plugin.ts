import fs from 'node:fs';
import path from 'node:path';
import glob from 'tiny-glob';
import {parseSync} from 'vite';
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
  let isDev = false;
  let routeEagerState = new Map<string, boolean>();

  const getPods = () => {
    if (!podsPromise) {
      podsPromise = collectPods(rootConfig);
    }
    return podsPromise;
  };

  return {
    name: 'root:pods',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      isDev = resolvedConfig.command === 'serve';
    },

    resolveId(id) {
      if (id === VIRTUAL_ROUTES_ID) return RESOLVED_VIRTUAL_ROUTES;
      if (id === VIRTUAL_SCHEMAS_ID) return RESOLVED_VIRTUAL_SCHEMAS;
      if (id === VIRTUAL_TRANSLATIONS_ID) return RESOLVED_VIRTUAL_TRANSLATIONS;
      return null;
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_ROUTES) {
        const result = await buildRoutesModule(
          rootConfig,
          await getPods(),
          isDev
        );
        if (isDev) {
          routeEagerState = result.routeEagerState;
        }
        return result.code;
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
      const userRoutesDir = path.resolve(rootConfig.rootDir, 'routes');
      const podRouteDirs: string[] = [];
      const watchDirs: string[] = [];
      getPods().then((pods) => {
        for (const pod of pods) {
          if (pod.routesDir) {
            watchDirs.push(pod.routesDir);
            podRouteDirs.push(path.resolve(pod.routesDir));
          }
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

      const invalidateRoutesModule = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ROUTES);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({type: 'full-reload'});
      };

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
        } else if (isRouteFileInDir(filePath, userRoutesDir)) {
          invalidateRoutesModule();
        }
      });
      server.watcher.on('unlink', (filePath) => {
        const resolvedPath = path.resolve(filePath);
        if (isInPodDir(filePath, watchDirs)) {
          routeEagerState.delete(resolvedPath);
          invalidateVirtualModules();
        } else if (isRouteFileInDir(filePath, userRoutesDir)) {
          routeEagerState.delete(resolvedPath);
          invalidateRoutesModule();
        }
      });
      server.watcher.on('change', async (filePath) => {
        const isWatchedRoute =
          isRouteFileInDir(filePath, userRoutesDir) ||
          podRouteDirs.some((dir) => isRouteFileInDir(filePath, dir));
        if (!isWatchedRoute) {
          return;
        }
        const resolvedPath = path.resolve(filePath);
        if (!routeEagerState.has(resolvedPath)) {
          return;
        }
        const nextEager = await hasRouteConfigExport(resolvedPath);
        if (routeEagerState.get(resolvedPath) !== nextEager) {
          invalidateRoutesModule();
        }
      });
    },
  };
}

function isRouteFileInDir(filePath: string, dir: string): boolean {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(dir + path.sep)) {
    return false;
  }
  const parts = path.parse(resolved);
  return !parts.name.startsWith('_') && isJsFile(parts.base);
}

function isInPodDir(filePath: string, watchDirs: string[]): boolean {
  for (const dir of watchDirs) {
    if (filePath.startsWith(dir)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a route file exports a `config` binding (or `export * from`)
 * that needs to be evaluated eagerly when building the route trie.
 */
async function hasRouteConfigExport(filePath: string): Promise<boolean> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    if (!content.includes('config') && !content.includes('*')) {
      return false;
    }
    const parsed = parseSync(filePath, content);
    if (parsed.errors.length > 0) {
      return true;
    }
    for (const staticExport of parsed.module.staticExports) {
      for (const entry of staticExport.entries) {
        if (
          !entry.isType &&
          (entry.exportName.name === 'config' ||
            entry.importName.kind === 'AllButDefault')
        ) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return true;
  }
}

async function buildRoutesModule(
  rootConfig: RootConfig,
  pods: ResolvedPod[],
  isDev: boolean
): Promise<{code: string; routeEagerState: Map<string, boolean>}> {
  const rootDir = rootConfig.rootDir;
  const imports: string[] = [];
  const userEntries: string[] = [];
  const podEntries: string[] = [];
  const nextRouteEagerState = new Map<string, boolean>();
  let idx = 0;

  // User project routes.
  const routesDir = path.join(rootDir, 'routes');
  if (await isDirectory(routesDir)) {
    const files = await glob('**/*', {cwd: routesDir});
    const routeFiles = files.filter((file) => {
      const parts = path.parse(file);
      return !parts.name.startsWith('_') && isJsFile(parts.base);
    });
    const eagerFlags = isDev
      ? await Promise.all(
          routeFiles.map((file) =>
            hasRouteConfigExport(path.join(routesDir, file))
          )
        )
      : routeFiles.map(() => true);
    for (let i = 0; i < routeFiles.length; i++) {
      const file = routeFiles[i];
      if (isDev) {
        nextRouteEagerState.set(path.resolve(routesDir, file), eagerFlags[i]);
      }
      const modulePath = `/routes/${file.replace(/\\/g, '/')}`;
      if (eagerFlags[i]) {
        const varName = `_r${idx++}`;
        imports.push(`import * as ${varName} from '${modulePath}';`);
        userEntries.push(`  '${modulePath}': ${varName},`);
      } else {
        userEntries.push(`  '${modulePath}': () => import('${modulePath}'),`);
      }
    }
  }

  // Pod routes.
  const podRouteItems = pods.flatMap((pod) =>
    pod.routeFiles.map((route) => ({pod, route}))
  );
  const podEagerFlags = isDev
    ? await Promise.all(
        podRouteItems.map(({route}) => hasRouteConfigExport(route.filePath))
      )
    : podRouteItems.map(() => true);
  for (let i = 0; i < podRouteItems.length; i++) {
    const {pod, route} = podRouteItems[i];
    if (isDev) {
      nextRouteEagerState.set(path.resolve(route.filePath), podEagerFlags[i]);
    }
    const meta = `podName: ${JSON.stringify(pod.name)}, routePath: ${JSON.stringify(route.routePath)}, src: ${JSON.stringify(`pod/${pod.name}/${route.relPath}`)}`;
    if (podEagerFlags[i]) {
      const varName = `_r${idx++}`;
      imports.push(`import * as ${varName} from '${route.filePath}';`);
      podEntries.push(`  '${route.filePath}': {module: ${varName}, ${meta}},`);
    } else {
      podEntries.push(
        `  '${route.filePath}': {loadModule: () => import('${route.filePath}'), ${meta}},`
      );
    }
  }

  const code = [
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

  return {code, routeEagerState: nextRouteEagerState};
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
 *
 * Results are returned depth-first with each directory's entries ordered by
 * name (the order the previous glob-based scan produced), since the order of
 * `SCHEMA_MODULES` determines the order of pattern-matched `oneOf` types.
 */
export async function scanRootSchemaFiles(rootDir: string): Promise<string[]> {
  async function walk(dir: string, relDir: string): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, {withFileTypes: true});
    } catch {
      return [];
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const pending: Array<string | Promise<string[]>> = [];
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
        pending.push(walk(path.join(dir, name), relPath));
      } else if (name.endsWith('.schema.ts')) {
        pending.push(relPath);
      }
    }
    return (await Promise.all(pending)).flat();
  }

  return walk(rootDir, '');
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
