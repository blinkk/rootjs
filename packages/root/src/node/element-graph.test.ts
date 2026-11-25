import {expect, test} from 'vitest';
import {ElementGraph} from './element-graph.js';

test('ElementGraph.getDeps() resolves transitive deps across cycles and memoizes', () => {
  const graph = ElementGraph.fromJson({
    sourceFiles: {
      'root-a': {
        filePath: '/elements/root-a.ts',
        relPath: 'elements/root-a.ts',
      },
      'root-b': {
        filePath: '/elements/root-b.ts',
        relPath: 'elements/root-b.ts',
      },
      'root-c': {
        filePath: '/elements/root-c.ts',
        relPath: 'elements/root-c.ts',
      },
    },
    deps: {
      'root-a': ['root-b'],
      'root-b': ['root-c'],
      'root-c': ['root-b'],
    },
  });

  const depsA = graph.getDeps('root-a');
  expect(depsA).toEqual(['root-b', 'root-c']);
  // Mutating the returned array must not corrupt the memoized cache.
  depsA.push('root-mutated');
  expect(graph.getDeps('root-a')).toEqual(['root-b', 'root-c']);

  // Direct deps are listed before the deps of deps.
  const ordered = ElementGraph.fromJson({
    sourceFiles: {},
    deps: {
      'root-a': ['root-b', 'root-c'],
      'root-b': ['root-d'],
      'root-c': [],
      'root-d': [],
    },
  });
  expect(ordered.getDeps('root-a')).toEqual(['root-b', 'root-c', 'root-d']);

  // Explicit visited set bypasses and does not pollute the top-level memo cache.
  const partialB = graph.getDeps('root-b', new Set(['root-c']));
  expect(partialB).toEqual(['root-c']);
  expect(graph.getDeps('root-b')).toEqual(['root-c', 'root-b']);
  expect(graph.getDeps('root-b')).toEqual(['root-c', 'root-b']);
});
