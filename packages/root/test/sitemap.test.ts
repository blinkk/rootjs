import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/sitemap');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build sitemap project', async () => {
  await fixture.build();
  const sitemap = path.join(fixture.distDir, 'html/sitemap.xml');
  assert.isTrue(await fileExists(sitemap));
  const xml = await fs.readFile(sitemap, 'utf-8');
  expect(xml).toMatchInlineSnapshot(`
    "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>
    <urlset xmlns=\\"http://www.sitemaps.org/schemas/sitemap/0.9\\" xmlns:xhtml=\\"http://www.w3.org/1999/xhtml\\" xmlns:xsi=\\"http://www.w3.org/2001/XMLSchema-instance\\" xsi:schemaLocation=\\"http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd\\">
    <url>
      <loc>https://www.example.com/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/\\" />
    </url>
    <url>
      <loc>https://www.example.com/de/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/\\" />
    </url>
    <url>
      <loc>https://www.example.com/de/foo/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/foo/\\" />
    </url>
    <url>
      <loc>https://www.example.com/en/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/\\" />
    </url>
    <url>
      <loc>https://www.example.com/bar/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/bar/\\" />
    </url>
    <url>
      <loc>https://www.example.com/baz/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/baz/\\" />
    </url>
    <url>
      <loc>https://www.example.com/de/bar/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/bar/\\" />
    </url>
    <url>
      <loc>https://www.example.com/de/baz/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/baz/\\" />
    </url>
    <url>
      <loc>https://www.example.com/en/bar/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/bar/\\" />
    </url>
    <url>
      <loc>https://www.example.com/en/baz/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/baz/\\" />
    </url>
    <url>
      <loc>https://www.example.com/en/foo/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/foo/\\" />
    </url>
    <url>
      <loc>https://www.example.com/foo/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"fr\\" href=\\"https://www.example.com/fr/foo/\\" />
    </url>
    <url>
      <loc>https://www.example.com/fr/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/\\" />
    </url>
    <url>
      <loc>https://www.example.com/fr/foo/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/foo/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/foo/\\" />
    </url>
    <url>
      <loc>https://www.example.com/fr/bar/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/bar/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/bar/\\" />
    </url>
    <url>
      <loc>https://www.example.com/fr/baz/</loc>
      <xhtml:link rel=\\"alternate\\" hreflang=\\"x-default\\" href=\\"https://www.example.com/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"de\\" href=\\"https://www.example.com/de/baz/\\" />
      <xhtml:link rel=\\"alternate\\" hreflang=\\"en\\" href=\\"https://www.example.com/en/baz/\\" />
    </url>
    </urlset>"
  `);
});
