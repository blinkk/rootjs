import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists, loadJson} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

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
    <html>
    <head>
    <meta charset="utf-8">
    <script type="module" src="/assets/root-counter.min.js"></script>
    <script type="module" src="/assets/root-label.min.js"></script>
    </head>
    <body>
    <h1>Counter</h1>
    <root-counter start="3"></root-counter>
    </body>
    </html>
    "
  `);
});

test('use custom elements from another directory', async () => {
  await fixture.build();
  const foo = path.join(fixture.distDir, 'html/ds-foo/index.html');
  assert.isTrue(await fileExists(foo));
  const html = await fs.readFile(foo, 'utf-8');
  assert.isTrue(html.includes('assets/ds-foo'));
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <script type="module" src="/assets/ds-foo.min.js"></script>
    </head>
    <body>
    <ds-foo name="Alice"></ds-foo>
    </body>
    </html>
    "
  `);
});

test('exclude elements from the ssg build', async () => {
  await fixture.build();
  const htmlPath = path.join(
    fixture.distDir,
    'html/exclude-build-elements/index.html'
  );
  assert.isTrue(await fileExists(htmlPath));
  const html = await fs.readFile(htmlPath, 'utf-8');
  // The element's asset should not be emitted to the build output.
  assert.isFalse(
    await fileExists(
      path.join(fixture.distDir, 'html/assets/debug-panel.min.js')
    )
  );
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <script type="module" src="/assets/root-counter.min.js"></script>
    <script type="module" src="/assets/root-label.min.js"></script>
    </head>
    <body>
    <h1>Counter</h1>
    <root-counter start="3"></root-counter>
    <h1>The following element deps should not be auto-injected:</h1>
    <debug-panel></debug-panel>
    </body>
    </html>
    "
  `);
});

test('keep excluded elements in an --ssr-only build', async () => {
  await fixture.build({ssrOnly: true});
  // `--ssr-only` generates the pre-built files for SSR mode, where pages are
  // rendered on demand, so preview-only elements are kept.
  assert.isTrue(
    await fileExists(
      path.join(fixture.distDir, 'html/assets/debug-panel.min.js')
    )
  );
  const elementGraph = await loadJson<{sourceFiles: Record<string, unknown>}>(
    path.join(fixture.distDir, '.root/elements.json')
  );
  assert.isTrue('debug-panel' in elementGraph.sourceFiles);
});

test('exclude elements matching a certain pattern', async () => {
  await fixture.build();
  const htmlPath = path.join(
    fixture.distDir,
    'html/exclude-stories/index.html'
  );
  assert.isTrue(await fileExists(htmlPath));
  const html = await fs.readFile(htmlPath, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <script type="module" src="/assets/root-counter.min.js"></script>
    <script type="module" src="/assets/root-label.min.js"></script>
    </head>
    <body>
    <h1>Counter</h1>
    <root-counter start="3"></root-counter>
    <h1>The following element deps should not be auto-injected:</h1>
    <root-exclude></root-exclude>
    </body>
    </html>
    "
  `);
});
