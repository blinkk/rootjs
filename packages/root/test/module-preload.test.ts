import {promises as fs} from 'node:fs';
import path from 'node:path';
import {afterEach, expect, test} from 'vitest';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

async function buildIndexHtml(fixturePath: string) {
  fixture = await loadFixture(fixturePath);
  await fixture.build();
  return await fs.readFile(
    path.join(fixture.distDir, 'html/index.html'),
    'utf-8'
  );
}

test('inject modulepreload tags for shared chunks', async () => {
  const html = await buildIndexHtml('./fixtures/module-preload');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <link rel="modulepreload" href="/chunks/shared.min.js">
    <script type="module" src="/assets/root-a.min.js"></script>
    <script type="module" src="/assets/root-b.min.js"></script>
    </head>
    <body>
    <root-a></root-a>
    <root-b></root-b>
    </body>
    </html>
    "
  `);
});

test('preloaded chunks are copied to the build output', async () => {
  await buildIndexHtml('./fixtures/module-preload');
  const chunk = path.join(fixture.distDir, 'html/chunks/shared.min.js');
  expect(await fs.readFile(chunk, 'utf-8')).toContain('textContent');
});

test('modulepreload tags are opt-in', async () => {
  const html = await buildIndexHtml('./fixtures/module-preload-disabled');
  expect(html).not.toContain('modulepreload');
  expect(html).toContain('<script type="module" src="/assets/root-a.min.js">');
});
