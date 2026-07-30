import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {ModuleGraph} from 'vite';
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
