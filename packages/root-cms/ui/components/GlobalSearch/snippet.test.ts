import {describe, it, expect} from 'vitest';
import type {GlobalSearchHit} from '../../hooks/useGlobalSearch.js';
import {buildSnippet} from './snippet.js';

function hit(text: string, terms: string[]): GlobalSearchHit {
  return {
    id: 'X',
    docId: 'Pages/x',
    collection: 'Pages',
    slug: 'x',
    deepKey: 'fields.body',
    fieldLabel: 'Body',
    fieldType: 'richtext',
    text,
    score: 1,
    terms,
  };
}

describe('buildSnippet', () => {
  it('returns an empty list for empty text', () => {
    expect(buildSnippet(hit('', ['foo']))).toEqual([]);
  });

  it('returns a single plain segment when no terms are present', () => {
    expect(buildSnippet(hit('hello world', []))).toEqual([
      {kind: 'text', value: 'hello world'},
    ]);
  });

  it('returns a single plain segment when terms do not match the text', () => {
    expect(buildSnippet(hit('hello world', ['xyz']))).toEqual([
      {kind: 'text', value: 'hello world'},
    ]);
  });

  it('marks every occurrence of a single term', () => {
    const segs = buildSnippet(hit('foo bar foo bar foo', ['foo']));
    const marks = segs.filter((s) => s.kind === 'mark').map((s) => s.value);
    expect(marks).toEqual(['foo', 'foo', 'foo']);
  });

  it('marks all matches across multiple terms', () => {
    const segs = buildSnippet(
      hit('the quick brown fox jumps', ['quick', 'fox'])
    );
    const marks = segs.filter((s) => s.kind === 'mark').map((s) => s.value);
    expect(marks).toEqual(['quick', 'fox']);
  });

  it('merges overlapping term ranges (no nested marks)', () => {
    // Both `home` and `homepage` match within the word "homepage" — the
    // result should be a single merged mark, not two overlapping ones.
    const segs = buildSnippet(hit('the homepage hero', ['home', 'homepage']));
    const marks = segs.filter((s) => s.kind === 'mark').map((s) => s.value);
    expect(marks).toEqual(['homepage']);
  });

  it('preserves original casing in the marked text', () => {
    const segs = buildSnippet(hit('The Quick Brown Fox', ['quick']));
    const mark = segs.find((s) => s.kind === 'mark');
    expect(mark?.value).toBe('Quick');
  });

  it('reconstructs the original window via concatenation', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const segs = buildSnippet(hit(text, ['quick', 'lazy']));
    expect(segs.map((s) => s.value).join('')).toBe(text);
  });

  it('windows around the first match for very long text', () => {
    const long = `${'a '.repeat(200)}TARGET${'b '.repeat(200)}`;
    const segs = buildSnippet(hit(long, ['target']));
    const joined = segs.map((s) => s.value).join('');
    expect(joined.startsWith('… ')).toBe(true);
    expect(joined.endsWith(' …')).toBe(true);
    expect(joined).toContain('TARGET');
    expect(joined.length).toBeLessThan(long.length);
  });
});
