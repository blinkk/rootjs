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
  // The root-counter dep should be included through direct usage.
  assert.isTrue(html.includes('assets/root-counter'));
  // The root-label dep should be included as a dependency of root-counter.
  assert.isTrue(html.includes('assets/root-label'));
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"en\\">
    <head>
    <meta charset=\\"utf-8\\">
    <script type=\\"module\\" src=\\"/assets/root-counter.5a3d9f5d.js\\"></script>
    <script type=\\"module\\" src=\\"/assets/root-label.dc252114.js\\"></script>
    </head>
    <body>
    <h1>Counter</h1>
    <root-counter start=\\"3\\"></root-counter>
    </body>
    </html>
    "
  `);
});
