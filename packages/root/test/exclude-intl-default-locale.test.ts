/* eslint-disable no-irregular-whitespace */

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/exclude-intl-default-locale');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build exclude-intl-default-locale project', async () => {
  await fixture.build();

  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset=\\"utf-8\\" />
    </head>
    <body>
    <h1>Hello world!</h1>
    <p>custom translation (en)</p>
    <p>Current locale: en</p>
    <p>Current path: /</p>
    </body>
    </html>
    "
  `);

  // The intl/en/ path should not exist.
  const enIndex = path.join(fixture.distDir, 'html/intl/en/index.html');
  assert.isFalse(await fileExists(enIndex));

  const frIndex = path.join(fixture.distDir, 'html/intl/fr/index.html');
  assert.isTrue(await fileExists(frIndex));
  const frHtml = await fs.readFile(frIndex, 'utf-8');
  expect(frHtml).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset=\\"utf-8\\" />
    </head>
    <body>
    <h1>Bonjour le monde !</h1>
    <p>custom translation (fr)</p>
    <p>Current locale: fr</p>
    <p>Current path: /intl/fr/</p>
    </body>
    </html>
    "
  `);

  const fooDefault = path.join(fixture.distDir, 'html/foo/bar/index.html');
  assert.isTrue(await fileExists(fooDefault));
  const fooDefaultHtml = await fs.readFile(fooDefault, 'utf-8');
  expect(fooDefaultHtml).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset=\\"utf-8\\" />
    </head>
    <body>
    <p>Current path: /foo/bar</p>
    <p>Locale from params: en</p>
    </body>
    </html>
    "
  `);

  const fooFr = path.join(fixture.distDir, 'html/intl/fr/foo/bar/index.html');
  assert.isTrue(await fileExists(fooFr));
  const fooFrHtml = await fs.readFile(fooFr, 'utf-8');
  expect(fooFrHtml).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset=\\"utf-8\\" />
    </head>
    <body>
    <p>Current path: /intl/fr/foo/bar</p>
    <p>Locale from params: fr</p>
    </body>
    </html>
    "
  `);

  // The intl/en/foo/bar/ path should not exist.
  const fooEn = path.join(fixture.distDir, 'html/intl/en/foo/bar/index.html');
  assert.isFalse(await fileExists(fooEn));
});
