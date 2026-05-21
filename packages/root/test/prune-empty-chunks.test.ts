import {promises as fs} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, expect, test} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/prune-empty-chunks');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

async function listJsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, {recursive: true, withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test('build does not emit 0-byte js chunks', async () => {
  await fixture.build();
  const clientDir = path.join(fixture.distDir, '.build/client');
  const jsFiles = await listJsFiles(clientDir);
  expect(jsFiles.length).toBeGreaterThan(0);
  for (const jsFile of jsFiles) {
    const stats = await fs.stat(jsFile);
    expect(stats.size, `${jsFile} should not be empty`).toBeGreaterThan(0);
  }
});

test('empty bundle chunk is pruned from output', async () => {
  await fixture.build();
  const clientDir = path.join(fixture.distDir, '.build/client');
  const emptyBundle = path.join(clientDir, 'assets/empty-bundle.min.js');
  expect(await fileExists(emptyBundle)).toBe(false);
});

test('imports of pruned chunks are removed from sibling chunks', async () => {
  await fixture.build();
  const clientDir = path.join(fixture.distDir, '.build/client');
  const mainBundle = path.join(clientDir, 'assets/main-bundle.min.js');
  expect(await fileExists(mainBundle)).toBe(true);
  const code = await fs.readFile(mainBundle, 'utf-8');
  // The dangling `import "./empty-bundle.min.js"` should be gone, but the
  // bundle's own code should remain.
  expect(code).not.toContain('empty-bundle');
  expect(code).toContain('main bundle loaded');
});

test('manifest does not reference pruned chunks', async () => {
  await fixture.build();
  const manifestPath = path.join(
    fixture.distDir,
    '.build/client/.vite/manifest.json'
  );
  const manifest = await fs.readFile(manifestPath, 'utf-8');
  expect(manifest).not.toContain('empty-bundle');
});
