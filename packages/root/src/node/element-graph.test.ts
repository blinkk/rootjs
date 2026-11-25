import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

test('ElementGraph.invalidateFile() resets memoized transitive deps', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-el-graph-'));
  try {
    const sourceFiles: Record<string, {filePath: string; relPath: string}> = {};
    for (const tagName of ['root-a', 'root-b', 'root-c']) {
      const filePath = path.join(tmpDir, `${tagName}.tsx`);
      sourceFiles[tagName] = {filePath, relPath: `${tagName}.tsx`};
    }
    fs.writeFileSync(sourceFiles['root-a'].filePath, '<root-b></root-b>');
    fs.writeFileSync(sourceFiles['root-b'].filePath, '<div></div>');
    fs.writeFileSync(sourceFiles['root-c'].filePath, '<div></div>');
    const graph = ElementGraph.fromJson({sourceFiles, deps: {}});
    expect(graph.getDeps('root-a')).toEqual(['root-b']);

    // Editing a transitive dep must be reflected in its dependents' deps.
    fs.writeFileSync(sourceFiles['root-b'].filePath, '<root-c></root-c>');
    expect(graph.invalidateFile(sourceFiles['root-b'].filePath)).toBe(true);
    expect(graph.getDeps('root-a')).toEqual(['root-b', 'root-c']);
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});
