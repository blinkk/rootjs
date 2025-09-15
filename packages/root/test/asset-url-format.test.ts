import path from 'node:path';
import {beforeEach, test, expect, afterEach} from 'vitest';
import {listFilesRecursive} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

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
      "static/assets/main.DhMJm-9z.min.js",
      "static/assets/page.D9V3Qi17.css",
    ]
  `);
});
