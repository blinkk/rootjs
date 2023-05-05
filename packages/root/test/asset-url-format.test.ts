import path from 'node:path';
import {beforeEach, test, expect, afterEach} from 'vitest';
import {listFilesRecursive} from '../src/utils/fsutils';
import {Fixture, loadFixture} from './testutils';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/asset-url-format');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('customize asset url format', async () => {
  await fixture.build();
  const outputStaticDir = path.join(fixture.distDir, 'html/');
  const staticFiles = await listFilesRecursive(outputStaticDir);
  const relStaticFiles = staticFiles.map((f) =>
    f.slice(outputStaticDir.length)
  );
  expect(relStaticFiles).toMatchInlineSnapshot(`
    [
      "static/assets/main.0c66ab34.min.js",
      "static/assets/page.ce0b0c3c.css",
    ]
  `);
});
