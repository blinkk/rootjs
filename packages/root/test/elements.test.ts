import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/core/fsutils';
import {Fixture, loadFixture} from './testutils';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/elements');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('add custom element to a page', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"en\\">
    <head>
    <meta charset=\\"utf-8\\">
    <script type=\\"module\\" src=\\"/assets/root-counter.31473159.js\\"></script>
    </head>
    <body>
    <h1>Counter</h1>
    <root-counter start=\\"3\\"></root-counter>
    </body>
    </html>
    "
  `);
});
