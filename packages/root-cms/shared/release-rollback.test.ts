import {describe, it, expect} from 'vitest';
import {
  decodeReleaseRollbackSnapshot,
  encodeReleaseRollbackSnapshot,
} from './release-rollback.js';

/** Returns the max depth of maps and arrays in a value. */
function getDepth(value: unknown): number {
  if (value && typeof value === 'object') {
    const children = Object.values(value);
    return 1 + Math.max(0, ...children.map(getDepth));
  }
  return 0;
}

describe('encodeReleaseRollbackSnapshot', () => {
  it('stores the previous data at the top level', () => {
    const previous = {
      id: 'Pages/foo',
      sys: {publishedAt: 1},
      fields: {title: 'before'},
    };
    const encoded = encodeReleaseRollbackSnapshot({
      type: 'doc',
      id: 'Pages/foo',
      releasedAt: 2,
      previous,
    });
    expect(encoded).toEqual({
      ...previous,
      _rollback: {
        type: 'doc',
        id: 'Pages/foo',
        releasedAt: 2,
        hasPrevious: true,
      },
    });
  });

  it('does not nest the previous data any deeper', () => {
    // Firestore limits maps and arrays to 20 levels of nesting.
    let fields: any = 'leaf';
    for (let i = 0; i < 19; i++) {
      fields = {a: fields};
    }
    const previous = {fields};
    expect(getDepth(previous)).toBe(20);
    const encoded = encodeReleaseRollbackSnapshot({
      type: 'doc',
      id: 'Pages/foo',
      releasedAt: 2,
      previous,
    });
    expect(getDepth(encoded)).toBe(20);
  });
});

describe('decodeReleaseRollbackSnapshot', () => {
  it('round trips snapshots', () => {
    const snapshots = [
      {
        type: 'doc' as const,
        id: 'Pages/foo',
        releasedAt: 2,
        previous: {id: 'Pages/foo', fields: {title: 'before'}},
      },
      {type: 'doc' as const, id: 'Pages/bar', releasedAt: 2, previous: null},
      {
        type: 'translations' as const,
        id: 'Pages/foo',
        locale: 'de',
        releasedAt: 2,
        previous: {id: 'Pages/foo', locale: 'de', strings: {}},
      },
      {
        type: 'dataSource' as const,
        id: 'products',
        releasedAt: 2,
        previous: {dataSource: {id: 'products'}, data: [{name: 'a'}]},
      },
    ];
    for (const snapshot of snapshots) {
      const decoded = decodeReleaseRollbackSnapshot(
        encodeReleaseRollbackSnapshot(snapshot)
      );
      expect(decoded).toEqual(snapshot);
    }
  });

  it('reads snapshots recorded in the original format', () => {
    const snapshot = {
      type: 'dataSource',
      id: 'products',
      releasedAt: 2,
      previous: {data: {value: 'before'}},
    };
    expect(decodeReleaseRollbackSnapshot(snapshot)).toEqual(snapshot);
  });
});
