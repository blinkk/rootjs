/* eslint-disable no-irregular-whitespace */

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/core/fsutils';
import {Fixture, loadFixture} from './testutils';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/i18n-url-format');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build i18n-url-format project', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"en\\">
    <head>
    <meta charset=\\"utf-8\\">
    </head>
    <body>
    <h1>Hello world!</h1>
    </body>
    </html>
    "
  `);

  const frIndex = path.join(fixture.distDir, 'html/intl/fr/index.html');
  assert.isTrue(await fileExists(frIndex));
  const frHtml = await fs.readFile(frIndex, 'utf-8');
  expect(frHtml).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"fr\\">
    <head>
    <meta charset=\\"utf-8\\">
    </head>
    <body>
    <h1>Bonjour le monde !</h1>
    </body>
    </html>
    "
  `);
});
