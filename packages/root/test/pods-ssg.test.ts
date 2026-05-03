import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assert, beforeEach, test, expect, afterEach} from 'vitest';
import {fileExists} from '../src/utils/fsutils.js';
import {Fixture, loadFixture} from './testutils.js';

let fixture: Fixture;

beforeEach(async () => {
  fixture = await loadFixture('./fixtures/pods-ssg');
});

afterEach(async () => {
  if (fixture) {
    await fixture.cleanup();
  }
});

test('build user route alongside pod routes', async () => {
  await fixture.build();
  const index = path.join(fixture.distDir, 'html/index.html');
  assert.isTrue(await fileExists(index));
  const html = await fs.readFile(index, 'utf-8');
  expect(html).toContain('<h1>User Home</h1>');
});

test('build pod static route', async () => {
  await fixture.build();
  const hello = path.join(fixture.distDir, 'html/from-pod/hello/index.html');
  assert.isTrue(await fileExists(hello));
  const html = await fs.readFile(hello, 'utf-8');
  expect(html).toContain('<h1>Hello from pod</h1>');
});

test('build pod dynamic route with getStaticPaths', async () => {
  await fixture.build();

  const alpha = path.join(fixture.distDir, 'html/from-pod/alpha/index.html');
  assert.isTrue(await fileExists(alpha));
  const alphaHtml = await fs.readFile(alpha, 'utf-8');
  expect(alphaHtml).toContain('<h1>Pod: alpha</h1>');

  const beta = path.join(fixture.distDir, 'html/from-pod/beta/index.html');
  assert.isTrue(await fileExists(beta));
  const betaHtml = await fs.readFile(beta, 'utf-8');
  expect(betaHtml).toContain('<h1>Pod: beta</h1>');
});
