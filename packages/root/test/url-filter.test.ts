import path from 'node:path';
import {assert, beforeEach, test} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/url-filter');
});

// afterEach(async () => {
//   if (fixture) {
//     await fixture.cleanup();
//   }
// });

test('build with --filter="/foo/.*"', async () => {
  await fixture.build({filter: '/foo/.*'});

  // Verify / doesn't exist.
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isFalse(await fileExists(index));

  // Verify /foo/* pages exist.
  const page1 = path.join(fixture.distDir, 'html/foo/bar/index.html');
  assert.isTrue(await fileExists(page1));
  const page2 = path.join(fixture.distDir, 'html/foo/baz/index.html');
  assert.isTrue(await fileExists(page2));

  // Verify /bar/* pages don't exist.
  const page3 = path.join(fixture.distDir, 'html/bar/foo/index.html');
  assert.isFalse(await fileExists(page3));
  const page4 = path.join(fixture.distDir, 'html/bar/baz/index.html');
  assert.isFalse(await fileExists(page4));
});
