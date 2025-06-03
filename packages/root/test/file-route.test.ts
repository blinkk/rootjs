import {promises as fs} from 'node:fs';
import path from 'node:path';
import {beforeEach, afterEach, test, assert, expect} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/file-route');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build file route project', async () => {
  await fixture.build();
  const sitemapPath = path.join(fixture.distDir, 'html/sitemap.xml');
  assert.isTrue(await fileExists(sitemapPath));
  const xml = await fs.readFile(sitemapPath, 'utf-8');
  expect(xml).toBe('<sitemap></sitemap>');

  const fooJson = path.join(fixture.distDir, 'html/data/foo.json');
  assert.isTrue(await fileExists(fooJson));
  const json = await fs.readFile(fooJson, 'utf-8');
  expect(json).toBe('{"slug":"foo"}');
});
