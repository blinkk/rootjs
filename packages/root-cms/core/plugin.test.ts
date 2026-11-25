// @vitest-environment node
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {RootConfig} from '@blinkk/root';
import {afterEach, describe, expect, it} from 'vitest';
import {cmsPlugin} from '../dist/plugin.js';

function createTestPlugin() {
  return cmsPlugin({
    id: 'test-site',
    firebaseConfig: {
      apiKey: 'test',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
    },
  });
}

describe('cmsPlugin build schema emission', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, {recursive: true, force: true});
    }
  });

  async function makeTempRootDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-cms-plugin-'));
    tempDirs.push(dir);
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({type: 'module'}),
      'utf8'
    );
    return dir;
  }

  it('registers cms-project in ssrInput alongside cms', () => {
    const plugin = createTestPlugin();
    const ssrInput = plugin.ssrInput?.() || {};
    expect(Object.keys(ssrInput).sort()).toEqual(['cms', 'cms-project']);
    expect(ssrInput['cms-project']).toMatch(/project\.js$/);
  });

  it('writes collection schemas from dist/server/cms-project.js on writeBundle', async () => {
    const rootDir = await makeTempRootDir();
    const serverDir = path.join(rootDir, 'dist', 'server');
    await fs.mkdir(serverDir, {recursive: true});
    await fs.writeFile(
      path.join(serverDir, 'cms-project.js'),
      [
        "export const SCHEMA_MODULES = {'/collections/Pages.schema.ts': {}};",
        'export function getCollectionSchema(id) {',
        "  return id === 'Pages' ? {id: 'Pages', name: 'Pages', fields: []} : null;",
        '}',
      ].join('\n'),
      'utf8'
    );

    const plugin = createTestPlugin();
    const rootConfig = {rootDir} as RootConfig;
    await plugin.hooks?.preBuild?.(rootConfig);

    const schemaPlugin = plugin.vitePlugins?.find(
      (p: any) => p?.name === 'root-cms:write-collection-schemas'
    ) as any;
    expect(schemaPlugin).toBeDefined();
    expect(schemaPlugin.apply).toBe('build');

    const bundle = {
      'cms-project.js': {
        type: 'chunk',
        isEntry: true,
        name: 'cms-project',
        fileName: 'cms-project.js',
      },
    };

    // Non-server outDir must be ignored and must not consume `buildRootConfig`.
    await schemaPlugin.writeBundle(
      {dir: path.join(rootDir, 'dist', '.build', 'routes')},
      bundle
    );
    await expect(
      fs.access(path.join(rootDir, 'dist', 'collections', 'Pages.schema.json'))
    ).rejects.toThrow();

    // Server outDir emits `dist/collections/Pages.schema.json`.
    await schemaPlugin.writeBundle({dir: serverDir}, bundle);
    const written = JSON.parse(
      await fs.readFile(
        path.join(rootDir, 'dist', 'collections', 'Pages.schema.json'),
        'utf8'
      )
    );
    expect(written).toEqual({id: 'Pages', name: 'Pages', fields: []});

    // `postBuild` succeeds once `writeBundle` has consumed `buildRootConfig`.
    await expect(
      plugin.hooks?.postBuild?.(rootConfig)
    ).resolves.toBeUndefined();
  });

  it('throws in postBuild if preBuild ran without emitting schemas, but allows standalone postBuild', async () => {
    const rootDir = await makeTempRootDir();
    const plugin = createTestPlugin();
    const rootConfig = {rootDir} as RootConfig;

    // Standalone `postBuild` without `preBuild` succeeds.
    await expect(
      plugin.hooks?.postBuild?.(rootConfig)
    ).resolves.toBeUndefined();

    // `preBuild` followed by `postBuild` with no `writeBundle` throws.
    await plugin.hooks?.preBuild?.(rootConfig);
    await expect(plugin.hooks?.postBuild?.(rootConfig)).rejects.toThrow(
      /collection schemas were not emitted during the server build/
    );
  });
});
