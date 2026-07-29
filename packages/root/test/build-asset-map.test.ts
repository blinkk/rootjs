import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Manifest} from 'vite';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {RootConfig} from '../src/core/config.js';
import {ElementGraph} from '../src/node/element-graph.js';
import {BuildAssetMap} from '../src/render/asset-map/build-asset-map.js';

let rootDir: string;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-asset-map-'));
});

afterEach(() => {
  if (rootDir) {
    fs.rmSync(rootDir, {recursive: true, force: true});
  }
});

const emptyElementGraph = new ElementGraph({});

test('aliases pod route srcs to their built asset', async () => {
  // A pod route file built into the manifest under its real (relative) path.
  const routeRelPath = 'pods/blog/routes/index.tsx';
  const routeFilePath = path.join(rootDir, routeRelPath);
  fs.mkdirSync(path.dirname(routeFilePath), {recursive: true});
  fs.writeFileSync(routeFilePath, 'export default () => null;\n');

  const clientManifest = {
    [routeRelPath]: {
      file: 'assets/index.abcd1234.js',
      src: routeRelPath,
      isEntry: true,
      css: ['assets/index.abcd1234.css'],
    },
  } as unknown as Manifest;

  const assetMap = BuildAssetMap.fromViteManifest(
    {rootDir} as RootConfig,
    clientManifest,
    emptyElementGraph,
    [{src: 'pod/blog/index.tsx', filePath: routeFilePath}]
  );

  // The virtual src resolves (no "could not find build asset") and inherits the
  // route's CSS deps, with no asset URL of its own.
  const asset = await assetMap.get('pod/blog/index.tsx');
  expect(asset).not.toBeNull();
  expect(asset!.assetUrl).toBe('');
  expect(await asset!.getCssDeps()).toEqual(['/assets/index.abcd1234.css']);
});

test('collects module preload deps from the import graph', async () => {
  const elementRelPath = 'elements/root-a/root-a.ts';
  const clientManifest = {
    [elementRelPath]: {
      file: 'assets/root-a.min.js',
      src: elementRelPath,
      isEntry: true,
      imports: ['_shared.min.js'],
      css: ['assets/root-a.css'],
    },
    '_shared.min.js': {
      file: 'chunks/shared.min.js',
      imports: ['_deep.min.js'],
    },
    '_deep.min.js': {
      file: 'chunks/deep.min.js',
      // Cyclic imports should not cause an infinite walk.
      imports: ['_shared.min.js'],
    },
  } as unknown as Manifest;

  const elementGraph = new ElementGraph({
    'root-a': {
      filePath: path.join(rootDir, elementRelPath),
      relPath: elementRelPath,
    },
  });
  const assetMap = BuildAssetMap.fromViteManifest(
    {rootDir} as RootConfig,
    clientManifest,
    elementGraph
  );

  const asset = await assetMap.get(elementRelPath);
  // The element's own URL is injected as a `<script>` tag, so it's excluded.
  // CSS deps are injected as stylesheets and excluded as well.
  expect(await asset!.getModulePreloadDeps()).toEqual([
    '/chunks/shared.min.js',
    '/chunks/deep.min.js',
  ]);
});

test('does not alias when the pod route has no built asset', async () => {
  const routeFilePath = path.join(rootDir, 'pods/blog/routes/api.ts');
  fs.mkdirSync(path.dirname(routeFilePath), {recursive: true});
  fs.writeFileSync(routeFilePath, 'export const handle = () => {};\n');

  const assetMap = BuildAssetMap.fromViteManifest(
    {rootDir} as RootConfig,
    {} as Manifest,
    emptyElementGraph,
    [{src: 'pod/blog/api.ts', filePath: routeFilePath}]
  );

  // The missing-asset lookup logs via console.log; stub it so the test output
  // stays clean, and assert it fired.
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const asset = await assetMap.get('pod/blog/api.ts');
    expect(asset).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      'could not find build asset: pod/blog/api.ts'
    );
  } finally {
    logSpy.mockRestore();
  }
});
