import path from 'node:path';
import {expect, test} from 'vitest';
import {ElementTagNameMatcher, RootConfig} from '../src/core/config.js';
import {getElements} from '../src/node/element-graph.js';

const rootDir = path.resolve(__dirname, './fixtures/elements');

function testConfig(excludeFromSsg?: ElementTagNameMatcher) {
  return {
    rootDir,
    elements: {
      exclude: [/\.stories\.tsx$/],
      excludeFromSsg,
    },
  } as RootConfig;
}

/** Returns the tag names in the graph built for the SSG phase of a build. */
async function ssgTagNames(excludeFromSsg: ElementTagNameMatcher) {
  const graph = await getElements(testConfig(excludeFromSsg), undefined, {
    isSsgBuild: true,
  });
  return Object.keys(graph.sourceFiles).sort();
}

test('elements.excludeFromSsg matches RegEx patterns', async () => {
  expect(await ssgTagNames([/^debug-/])).toEqual([
    'root-counter',
    'root-label',
  ]);
});

test('elements.excludeFromSsg matches strings exactly', async () => {
  expect(await ssgTagNames(['debug-panel'])).toEqual([
    'root-counter',
    'root-label',
  ]);
  // A partial string is not a substring or prefix match.
  expect(await ssgTagNames(['debug-'])).toEqual([
    'debug-panel',
    'root-counter',
    'root-label',
  ]);
  // Strings and RegEx patterns can be mixed in the same list.
  expect(await ssgTagNames(['root-label', /^debug-/])).toEqual([
    'root-counter',
  ]);
});

test('elements.excludeFromSsg matches a predicate function', async () => {
  const ssrOnly = new Set(['debug-panel', 'root-label']);
  expect(await ssgTagNames((tagName) => ssrOnly.has(tagName))).toEqual([
    'root-counter',
  ]);
});

test('elements.excludeFromSsg only applies to the ssg build', async () => {
  const rootConfig = testConfig([/^debug-/]);
  // The dev server and `--ssr-only` builds pass no `isSsgBuild`, so the
  // excluded elements remain in the graph and are still auto-injected.
  const graph = await getElements(rootConfig);
  expect(Object.keys(graph.sourceFiles).sort()).toEqual([
    'debug-panel',
    'root-counter',
    'root-label',
  ]);
});

test('elements.exclude applies to every command', async () => {
  const rootConfig = testConfig([/^debug-/]);
  const devGraph = await getElements(rootConfig);
  expect(devGraph.sourceFiles).not.toHaveProperty('root-exclude');

  const ssgGraph = await getElements(rootConfig, undefined, {isSsgBuild: true});
  expect(ssgGraph.sourceFiles).not.toHaveProperty('root-exclude');
});
