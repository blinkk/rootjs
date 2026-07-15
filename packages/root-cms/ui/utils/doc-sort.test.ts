import {describe, expect, it} from 'vitest';
import {sortDocsManualOrder} from './doc-sort.js';

function doc(slug: string, sortKey?: string, createdAtMillis?: number) {
  return {
    slug,
    sys: {
      sortKey,
      createdAt:
        createdAtMillis === undefined
          ? undefined
          : {toMillis: () => createdAtMillis},
    },
  };
}

describe('sortDocsManualOrder', () => {
  it('sorts keyed docs by sort key ascending', () => {
    const docs = [doc('c', 'a2'), doc('a', 'a0V'), doc('b', 'a1')];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted.map((d) => d.slug)).toEqual(['a', 'b', 'c']);
  });

  it('places keyless docs after keyed docs, newest first', () => {
    const docs = [
      doc('old-import', undefined, 1000),
      doc('second', 'a1'),
      doc('new-import', undefined, 2000),
      doc('first', 'a0'),
    ];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted.map((d) => d.slug)).toEqual([
      'first',
      'second',
      'new-import',
      'old-import',
    ]);
  });

  it('breaks sort key ties by slug, matching firestore document-name ties', () => {
    const docs = [doc('b', 'a1'), doc('a', 'a1'), doc('c', 'a0')];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted.map((d) => d.slug)).toEqual(['c', 'a', 'b']);
  });

  it('breaks keyless createdAt ties by slug', () => {
    const docs = [doc('b', undefined, 1000), doc('a', undefined, 1000)];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted.map((d) => d.slug)).toEqual(['a', 'b']);
  });

  it('tolerates docs with missing sys data', () => {
    const docs = [{slug: 'no-sys'} as any, doc('keyed', 'a0')];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted.map((d) => d.slug)).toEqual(['keyed', 'no-sys']);
  });

  it('returns a new array without mutating the input', () => {
    const docs = [doc('b', 'a1'), doc('a', 'a0')];
    const sorted = sortDocsManualOrder(docs);
    expect(sorted).not.toBe(docs);
    expect(docs.map((d) => d.slug)).toEqual(['b', 'a']);
  });
});
