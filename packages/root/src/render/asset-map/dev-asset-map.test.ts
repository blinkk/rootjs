import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {ModuleGraph, ModuleNode} from 'vite';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {RootConfig} from '../../core/config.js';
import {DevServerAssetMap} from './dev-asset-map.js';

let workspaceDir: string;
let rootDir: string;
let assetMap: DevServerAssetMap;

// A module graph that never resolves a file, which exercises the fallback
// branches that serve files that never made it into vite's module graph.
const emptyModuleGraph = {
  getModulesByFile: () => undefined,
} as unknown as ModuleGraph;

beforeEach(() => {
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-dev-assets-'));
  // `searchForWorkspaceRoot()` walks up for a `pnpm-workspace.yaml`, so the
  // workspace root is deterministic within the temp dir.
  fs.writeFileSync(path.join(workspaceDir, 'pnpm-workspace.yaml'), '');
  rootDir = path.join(workspaceDir, 'site');
  fs.mkdirSync(rootDir);
  assetMap = new DevServerAssetMap({rootDir} as RootConfig, emptyModuleGraph);
});

afterEach(() => {
  if (workspaceDir) {
    fs.rmSync(workspaceDir, {recursive: true, force: true});
  }
});

test('serves files within the project from the root dir', () => {
  const asset = assetMap.get('bundles/main.ts');
  expect(asset!.assetUrl).toBe('/bundles/main.ts');
});

test('serves sibling dirs sharing the root dir prefix from /@fs/', () => {
  // `<workspace>/site-legacy` is a sibling of `<workspace>/site`, not a child
  // of it, even though its path starts with the root dir's path.
  const filePath = path.join(workspaceDir, 'site-legacy/main.ts');
  fs.mkdirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, 'export default 1;\n');

  const asset = assetMap.get('../site-legacy/main.ts');
  expect(asset!.assetUrl).toBe(`/@fs/${filePath}`);
});

test('serves workspace files that do not exist on disk', () => {
  const filePath = path.join(workspaceDir, 'packages/ui/main.ts');
  const asset = assetMap.get('../packages/ui/main.ts');
  expect(asset!.assetUrl).toBe(`/@fs/${filePath}`);
});

test('returns null for files outside of the workspace', () => {
  // The missing-asset lookup logs via console.log; stub it so the test output
  // stays clean, and assert it fired.
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const src = path.relative(rootDir, path.join(os.tmpdir(), 'outside.ts'));
    expect(assetMap.get(src)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      `could not find asset in asset map: ${src}`
    );
  } finally {
    logSpy.mockRestore();
  }
});

/** Creates a minimal Vite `ModuleNode` stub for graph traversal tests. */
function createModuleNode(
  file: string,
  url: string,
  importedModules: ModuleNode[] = []
): ModuleNode {
  return {
    id: file,
    file,
    url,
    importedModules: new Set(importedModules),
  } as unknown as ModuleNode;
}

test('memoizes DevServerAsset instances and deps across shared sub-graphs', async () => {
  const sharedPartial = createModuleNode(
    path.join(rootDir, 'styles/_vars.scss'),
    '/styles/_vars.scss'
  );
  const sharedCss = createModuleNode(
    path.join(rootDir, 'styles/shared.scss'),
    '/styles/shared.scss',
    [sharedPartial]
  );
  const childEl = createModuleNode(
    path.join(rootDir, 'elements/child-el/child-el.ts'),
    '/elements/child-el/child-el.ts',
    [sharedCss]
  );
  const sharedUtil = createModuleNode(
    path.join(rootDir, 'utils/shared.ts'),
    '/utils/shared.ts',
    [sharedCss, childEl]
  );
  const elA = createModuleNode(
    path.join(rootDir, 'elements/el-a/el-a.ts'),
    '/elements/el-a/el-a.ts',
    [sharedUtil]
  );
  const elB = createModuleNode(
    path.join(rootDir, 'elements/el-b/el-b.ts'),
    '/elements/el-b/el-b.ts',
    [sharedUtil]
  );

  const byFile = new Map<string, Set<ModuleNode>>([
    [elA.file!, new Set([elA])],
    [elB.file!, new Set([elB])],
  ]);
  const graph = {
    getModulesByFile: (file: string) => byFile.get(file),
  } as unknown as ModuleGraph;
  const map = new DevServerAssetMap({rootDir} as RootConfig, graph);

  const assetA1 = map.get('elements/el-a/el-a.ts');
  const assetA2 = map.get('elements/el-a/el-a.ts');
  expect(assetA1).toBe(assetA2);

  expect(await assetA1!.getCssDeps()).toEqual(['/styles/shared.scss']);
  expect(await assetA1!.getJsDeps()).toEqual([
    '/elements/el-a/el-a.ts',
    '/elements/child-el/child-el.ts',
  ]);

  const assetB = map.get('elements/el-b/el-b.ts');
  expect(await assetB!.getCssDeps()).toEqual(['/styles/shared.scss']);
  expect(await assetB!.getJsDeps()).toEqual([
    '/elements/el-b/el-b.ts',
    '/elements/child-el/child-el.ts',
  ]);
});

test('collects CSS and JS deps safely across cyclic module graphs', async () => {
  const cssA = createModuleNode(
    path.join(rootDir, 'styles/a.scss'),
    '/styles/a.scss'
  );
  const cssB = createModuleNode(
    path.join(rootDir, 'styles/b.scss'),
    '/styles/b.scss'
  );
  const elA = createModuleNode(
    path.join(rootDir, 'elements/el-a/el-a.ts'),
    '/elements/el-a/el-a.ts',
    [cssA]
  );
  const elB = createModuleNode(
    path.join(rootDir, 'elements/el-b/el-b.ts'),
    '/elements/el-b/el-b.ts',
    [cssB, elA]
  );
  elA.importedModules.add(elB);

  const byFile = new Map<string, Set<ModuleNode>>([
    [elA.file!, new Set([elA])],
    [elB.file!, new Set([elB])],
  ]);
  const graph = {
    getModulesByFile: (file: string) => byFile.get(file),
  } as unknown as ModuleGraph;
  const map = new DevServerAssetMap({rootDir} as RootConfig, graph);

  const assetA = map.get('elements/el-a/el-a.ts')!;
  const assetB = map.get('elements/el-b/el-b.ts')!;

  expect(await assetA.getCssDeps()).toEqual([
    '/styles/a.scss',
    '/styles/b.scss',
  ]);
  expect(await assetB.getCssDeps()).toEqual([
    '/styles/b.scss',
    '/styles/a.scss',
  ]);
  expect(await assetA.getJsDeps()).toEqual([
    '/elements/el-a/el-a.ts',
    '/elements/el-b/el-b.ts',
  ]);
  expect(await assetB.getJsDeps()).toEqual([
    '/elements/el-b/el-b.ts',
    '/elements/el-a/el-a.ts',
  ]);
});

test('clears memoized assets across event-loop turns when ModuleNode mutates', async () => {
  const initialCss = createModuleNode(
    path.join(rootDir, 'styles/initial.scss'),
    '/styles/initial.scss'
  );
  const addedCss = createModuleNode(
    path.join(rootDir, 'styles/added.scss'),
    '/styles/added.scss'
  );
  const addedEl = createModuleNode(
    path.join(rootDir, 'elements/added-el/added-el.ts'),
    '/elements/added-el/added-el.ts'
  );
  const rootEl = createModuleNode(
    path.join(rootDir, 'elements/root-el/root-el.ts'),
    '/elements/root-el/root-el.ts',
    [initialCss]
  );

  const byFile = new Map<string, Set<ModuleNode>>([
    [rootEl.file!, new Set([rootEl])],
  ]);
  const graph = {
    getModulesByFile: (file: string) => byFile.get(file),
  } as unknown as ModuleGraph;
  const map = new DevServerAssetMap({rootDir} as RootConfig, graph);

  const first = map.get('elements/root-el/root-el.ts')!;
  expect(await first.getCssDeps()).toEqual(['/styles/initial.scss']);
  expect(await first.getJsDeps()).toEqual(['/elements/root-el/root-el.ts']);

  // Simulate Vite mutating `importedModules` in-place on HMR or late transform.
  rootEl.importedModules.add(addedCss);
  rootEl.importedModules.add(addedEl);
  await new Promise((resolve) => setImmediate(resolve));

  const second = map.get('elements/root-el/root-el.ts')!;
  expect(second).not.toBe(first);
  expect(await second.getCssDeps()).toEqual([
    '/styles/initial.scss',
    '/styles/added.scss',
  ]);
  expect(await second.getJsDeps()).toEqual([
    '/elements/root-el/root-el.ts',
    '/elements/added-el/added-el.ts',
  ]);
});
