import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/plugin-routes');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build project with plugin routes', async () => {
  await fixture.build();

  // Check static route
  const index = path.join(fixture.distDir, 'html/plugin-route/index.html');
  assert.isTrue(await fileExists(index), `File not found: ${index}`);
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toContain('<h1>Hello from plugin route!</h1>');

  // Check dynamic route [id]
  const product123 = path.join(fixture.distDir, 'html/products/123/index.html');
  assert.isTrue(await fileExists(product123), `File not found: ${product123}`);
  const productHtml = await fs.readFile(product123, 'utf-8');
  expect(productHtml).toContain('<h1>Product: 123</h1>');

  // Check catch-all route [[...slug]]
  const wikiIndex = path.join(fixture.distDir, 'html/wiki/index.html');
  assert.isTrue(await fileExists(wikiIndex), `File not found: ${wikiIndex}`);
  const wikiIndexHtml = await fs.readFile(wikiIndex, 'utf-8');
  expect(wikiIndexHtml).toContain('<h1>Wiki: index</h1>');

  const wikiFoo = path.join(fixture.distDir, 'html/wiki/foo/index.html');
  assert.isTrue(await fileExists(wikiFoo), `File not found: ${wikiFoo}`);
  const wikiFooHtml = await fs.readFile(wikiFoo, 'utf-8');
  expect(wikiFooHtml).toContain('<h1>Wiki: foo</h1>');

  // Check getStaticProps
  const propsIndex = path.join(fixture.distDir, 'html/props/index.html');
  assert.isTrue(await fileExists(propsIndex), `File not found: ${propsIndex}`);
  const propsHtml = await fs.readFile(propsIndex, 'utf-8');
  expect(propsHtml).toContain('<h1>Props: Hello from getStaticProps!</h1>');

  // Check handler
  // Note: Handlers are executed at runtime, but for SSG builds they might not be fully testable
  // via static file output unless they modify the response in a way that affects the HTML.
  // However, we can check if the file was generated.
  const handlerIndex = path.join(fixture.distDir, 'html/handler/index.html');
  assert.isTrue(
    await fileExists(handlerIndex),
    `File not found: ${handlerIndex}`
  );
  const handlerHtml = await fs.readFile(handlerIndex, 'utf-8');
  expect(handlerHtml).toContain('<h1>Handler Route</h1>');
});
