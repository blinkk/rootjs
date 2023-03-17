import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils';
import {Fixture, loadFixture} from './testutils';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/minimal');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build minimal project', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset=\\"utf-8\\">
    </head>
    <body>
    <h1>Hello, world!</h1>
    </body>
    </html>
    "
  `);
});
