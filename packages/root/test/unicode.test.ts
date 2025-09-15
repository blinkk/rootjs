import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/unicode');
});

// afterEach(async () => {
//   if (fixture) {
//     await fixture.cleanup();
//   }
// });

test('build unicode routes', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/こんにちは/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    </head>
    <body>
    <h1>こんにちは</h1>
    </body>
    </html>
    "
  `);

  const subpath = path.join(fixture.distDir, 'html/世界/foo/index.html');
  assert.isTrue(await fileExists(subpath));
  const subpathHtml = await fs.readFile(subpath, 'utf-8');
  expect(subpathHtml).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    </head>
    <body>
    <h1>世界</h1>
    </body>
    </html>
    "
  `);
});
