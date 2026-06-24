import path from 'node:path';
import {assert, beforeEach, test, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/i18n-route-locales');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('routes can override the site-wide i18n.locales', async () => {
  await fixture.build();

  const html = (...parts: string[]) =>
    path.join(fixture.distDir, 'html', ...parts);

  // The default index route uses the site-wide locales (en, fr, de).
  assert.isTrue(await fileExists(html('index.html')));
  assert.isTrue(await fileExists(html('intl/en/index.html')));
  assert.isTrue(await fileExists(html('intl/fr/index.html')));
  assert.isTrue(await fileExists(html('intl/de/index.html')));

  // The default-locale path is always generated, even for routes that override
  // their locales.
  assert.isTrue(await fileExists(html('limited/index.html')));

  // The /limited route overrides locales to ['fr'], so only the fr localized
  // path is generated.
  assert.isTrue(await fileExists(html('intl/fr/limited/index.html')));

  // The en and de localized paths should NOT be generated for /limited.
  assert.isFalse(await fileExists(html('intl/en/limited/index.html')));
  assert.isFalse(await fileExists(html('intl/de/limited/index.html')));
});
