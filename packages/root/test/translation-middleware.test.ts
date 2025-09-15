import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/translation-middleware');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('apply translation middleware', async () => {
  await fixture.build();
  const indexPath = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(indexPath));
  const html = await fs.readFile(indexPath, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    </head>
    <body>
    <p>HELLO!</p>
    </body>
    </html>
    "
  `);
});
