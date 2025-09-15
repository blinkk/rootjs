import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/css-topsort');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build css-topsort', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toMatchInlineSnapshot(`
    "<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/assets/Bt2MPTQs.css" />
    </head>
    <body>
    <h1>Hello world</h1>
    <div class="_route_10ibl_1">
    <div class="_componentA_1pvw6_1">
    <div class="_componentB_eq856_1">B</div>
    </div>
    </div>
    </body>
    </html>
    "
  `);

  const manifestPath = path.join(fixture.distDir, '.root/manifest.json');
  assert.isTrue(await fileExists(manifestPath));
  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent);
  assert.isTrue('routes/index.tsx' in manifest);
  const importedCss = manifest['routes/index.tsx'].importedCss;
  assert.equal(importedCss.length, 1);
  const assetUrl = importedCss[0];
  const cssPath = `${fixture.distDir}/html${assetUrl}`;
  assert.isTrue(await fileExists(cssPath), `file does not exist: ${cssPath}`);
  const css = await fs.readFile(cssPath, 'utf-8');

  // Since the route imports layout and component A, and component A imports
  // component B, expect the css deps order to be:
  // layout.css -> b.css -> a.css -> route.css
  const layoutIndex = css.indexOf('.layout');
  const componentBIndex = css.indexOf('._componentB');
  const componentAIndex = css.indexOf('._componentA');
  const routeIndex = css.indexOf('._route');
  assert.isTrue(
    [
      layoutIndex < componentBIndex,
      componentBIndex < componentAIndex,
      componentAIndex < routeIndex,
    ].every((i) => !!i)
  );
});
