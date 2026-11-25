import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {scanRootSchemaFiles} from '../src/node/pods-vite-plugin.js';

describe('scanRootSchemaFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'root-scan-schemas-')
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeSchema(relPath: string) {
    const fullPath = path.join(tmpDir, relPath);
    await fs.promises.mkdir(path.dirname(fullPath), {recursive: true});
    await fs.promises.writeFile(fullPath, 'export default {};');
  }

  it('discovers nested schema files without traversing excluded directories', async () => {
    await Promise.all([
      writeSchema('templates/Hero/Hero.schema.ts'),
      writeSchema('templates/Hero-Alt/HeroAlt.schema.ts'),
      writeSchema('templates/Section/Nested/Item.schema.ts'),
      writeSchema('blocks/Copy/Copy.schema.ts'),
      writeSchema('root.schema.ts'),
      writeSchema('collections/Pages.schema.ts'),
      writeSchema('node_modules/pkg/index.schema.ts'),
      writeSchema('dist/assets/built.schema.ts'),
      writeSchema('appengine/app.schema.ts'),
      writeSchema('functions/fn.schema.ts'),
      writeSchema('gae/gae.schema.ts'),
      writeSchema('.git/hidden.schema.ts'),
      writeSchema('.vite/cache.schema.ts'),
      writeSchema('templates/Hero/.hidden.schema.ts'),
      writeSchema('templates/node_modules/nested/ignored.schema.ts'),
    ]);

    const readdirSpy = vi.spyOn(fs.promises, 'readdir');
    const files = await scanRootSchemaFiles(tmpDir);

    // Depth-first, ordered by name within each directory (`Hero` sorts before
    // `Hero-Alt`), matching the order of the previous glob-based scan.
    expect(files).toEqual([
      'blocks/Copy/Copy.schema.ts',
      'root.schema.ts',
      'templates/Hero/Hero.schema.ts',
      'templates/Hero-Alt/HeroAlt.schema.ts',
      'templates/Section/Nested/Item.schema.ts',
    ]);

    const scannedDirs = readdirSpy.mock.calls.map((call) =>
      path.relative(tmpDir, String(call[0])).replace(/\\/g, '/')
    );
    for (const excluded of [
      'node_modules',
      'dist',
      'appengine',
      'functions',
      'gae',
      'collections',
      '.git',
      '.vite',
      'templates/node_modules',
    ]) {
      expect(scannedDirs).not.toContain(excluded);
    }
  });

  it('returns an empty array if rootDir does not exist', async () => {
    const files = await scanRootSchemaFiles(path.join(tmpDir, 'missing'));
    expect(files).toEqual([]);
  });
});
