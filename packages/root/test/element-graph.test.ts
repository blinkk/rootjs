import path from 'node:path';
import {expect, test} from 'vitest';
import {RootConfig} from '../src/core/config.js';
import {getElements} from '../src/node/element-graph.js';

const rootDir = path.resolve(__dirname, './fixtures/elements');

const rootConfig = {
  rootDir,
  elements: {
    exclude: [/\.stories\.tsx$/],
  },
  build: {
    excludeElements: [/^debug-/],
  },
} as RootConfig;

test('build.excludeElements only applies to the build', async () => {
  // The dev server passes no options, so preview-only elements remain in the
  // graph and continue to be auto-injected.
  const devGraph = await getElements(rootConfig);
  expect(Object.keys(devGraph.sourceFiles).sort()).toEqual([
    'debug-panel',
    'root-counter',
    'root-label',
  ]);

  const buildGraph = await getElements(rootConfig, undefined, {isBuild: true});
  expect(Object.keys(buildGraph.sourceFiles).sort()).toEqual([
    'root-counter',
    'root-label',
  ]);
});

test('elements.exclude applies to every command', async () => {
  const devGraph = await getElements(rootConfig);
  expect(devGraph.sourceFiles).not.toHaveProperty('root-exclude');

  const buildGraph = await getElements(rootConfig, undefined, {isBuild: true});
  expect(buildGraph.sourceFiles).not.toHaveProperty('root-exclude');
});
