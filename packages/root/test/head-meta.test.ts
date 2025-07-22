import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/head-meta');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('inject meta tags into <head>', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"en-GB\\" dir=\\"ltr\\">
    <head>
    <meta charset=\\"utf-8\\" />
    <title>Hello world</title>
    <meta content=\\"website\\" property=\\"og:type\\" />
    <meta content=\\"summary_large_image\\" name=\\"twitter:card\\" />
    <meta content=\\"Hello world\\" property=\\"og:title\\" />
    </head>
    <body class=\\"body\\">
    <h1>Hello world</h1>
    </body>
    </html>
    "
  `);
});
