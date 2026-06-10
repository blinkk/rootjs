import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, afterEach, expect, test} from 'vitest';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

/** Recursively collects {relPath: contents} for all files in a dir. */
async function collectOutput(dir: string): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, {withFileTypes: true});
    for (const entry of entries) {
      const filePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
      } else {
        const relPath = path.relative(dir, filePath);
        output[relPath] = await fs.readFile(filePath, 'utf-8');
      }
    }
  }
  await walk(dir);
  return output;
}

test(
  'threaded build output matches single-threaded build',
  {timeout: 90000},
  async () => {
    // The build-threads fixture exercises multiple locales, getStaticPaths(),
    // getStaticContent() file routes (e.g. feed.xml.ts and [slug].json.ts),
    // 404.tsx, and sitemap.xml generation.
    fixture = await loadFixture('./fixtures/build-threads');
    const htmlDir = path.join(fixture.distDir, 'html');

    await fixture.build();
    const baseline = await collectOutput(htmlDir);
    await fixture.cleanup();

    await fixture.build({threads: '2'});
    const threaded = await collectOutput(htmlDir);

    // Sanity check the fixture produced meaningful output.
    assert.isAbove(Object.keys(baseline).length, 0);
    assert.include(Object.keys(baseline), 'sitemap.xml');
    assert.include(Object.keys(baseline), 'feed.xml');
    assert.include(Object.keys(baseline), path.join('data', 'foo.json'));
    assert.include(Object.keys(baseline), '404.html');
    assert.include(Object.keys(baseline), path.join('de', 'bar', 'index.html'));

    expect(Object.keys(threaded).sort()).toEqual(Object.keys(baseline).sort());
    for (const relPath of Object.keys(baseline)) {
      expect(threaded[relPath], relPath).toEqual(baseline[relPath]);
    }

    // Auto mode picks a worker count based on cpu cores and page count (and
    // may stay in-process for small builds); output should be identical
    // either way.
    await fixture.cleanup();
    await fixture.build({threads: 'auto'});
    const auto = await collectOutput(htmlDir);
    expect(Object.keys(auto).sort()).toEqual(Object.keys(baseline).sort());
    for (const relPath of Object.keys(baseline)) {
      expect(auto[relPath], relPath).toEqual(baseline[relPath]);
    }
  }
);
