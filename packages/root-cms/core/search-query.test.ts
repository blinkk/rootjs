import MiniSearch from 'minisearch';
import {describe, it, expect} from 'vitest';
import {SearchIndexService, withWeight} from './search-index.js';
import {
  containsPhrase,
  executeQuery,
  isEmptyQuery,
  parseQuery,
} from './search-query.js';

describe('parseQuery', () => {
  it('parses a single bare term', () => {
    expect(parseQuery('foo')).toEqual({
      phrases: [],
      terms: ['foo'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('splits multiple bare terms on whitespace', () => {
    expect(parseQuery('foo  bar\tbaz')).toEqual({
      phrases: [],
      terms: ['foo', 'bar', 'baz'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('extracts a quoted phrase', () => {
    expect(parseQuery('"foo bar"')).toEqual({
      phrases: ['foo bar'],
      terms: [],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('mixes phrases and bare terms', () => {
    expect(parseQuery('hero "foo bar" baz')).toEqual({
      phrases: ['foo bar'],
      terms: ['hero', 'baz'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('treats `-foo` as an exclusion', () => {
    expect(parseQuery('foo -bar')).toEqual({
      phrases: [],
      terms: ['foo'],
      excluded: ['bar'],
      excludedPhrases: [],
    });
  });

  it('treats `-"foo bar"` as an excluded phrase', () => {
    expect(parseQuery('keep -"throw away"')).toEqual({
      phrases: [],
      terms: ['keep'],
      excluded: [],
      excludedPhrases: ['throw away'],
    });
  });

  it('normalizes smart quotes to straight quotes', () => {
    // U+201C / U+201D — the iOS / macOS "smart quote" defaults.
    expect(parseQuery('“foo bar”')).toEqual({
      phrases: ['foo bar'],
      terms: [],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('treats an unclosed quote as a phrase to end-of-input', () => {
    expect(parseQuery('"foo bar')).toEqual({
      phrases: ['foo bar'],
      terms: [],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('skips empty quotes', () => {
    expect(parseQuery('foo "" "  " bar')).toEqual({
      phrases: [],
      terms: ['foo', 'bar'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('keeps an embedded dash inside a term', () => {
    // `foo-bar` is a single token; only a leading `-` after whitespace excludes.
    expect(parseQuery('foo-bar')).toEqual({
      phrases: [],
      terms: ['foo-bar'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('drops a standalone dash', () => {
    expect(parseQuery('foo - bar')).toEqual({
      phrases: [],
      terms: ['foo', 'bar'],
      excluded: [],
      excludedPhrases: [],
    });
  });

  it('handles empty / whitespace-only input', () => {
    expect(parseQuery('')).toEqual({
      phrases: [],
      terms: [],
      excluded: [],
      excludedPhrases: [],
    });
    expect(parseQuery('   ')).toEqual({
      phrases: [],
      terms: [],
      excluded: [],
      excludedPhrases: [],
    });
  });
});

describe('isEmptyQuery', () => {
  it('treats a parsed query without positive constraints as empty', () => {
    expect(isEmptyQuery(parseQuery(''))).toBe(true);
    expect(isEmptyQuery(parseQuery('   '))).toBe(true);
    // Pure exclusions can't be answered without enumerating the index.
    expect(isEmptyQuery(parseQuery('-foo'))).toBe(true);
    expect(isEmptyQuery(parseQuery('foo'))).toBe(false);
    expect(isEmptyQuery(parseQuery('"foo"'))).toBe(false);
  });
});

describe('containsPhrase', () => {
  it('matches a contiguous run of word tokens', () => {
    expect(containsPhrase('the quick brown fox', 'quick brown')).toBe(true);
    expect(containsPhrase('the quick brown fox', 'brown quick')).toBe(false);
  });

  it('ignores punctuation between tokens', () => {
    expect(containsPhrase('quick. brown! fox?', 'quick brown fox')).toBe(true);
  });

  it('requires word boundaries (no substring matches)', () => {
    expect(containsPhrase('foobar', 'foo bar')).toBe(false);
    expect(containsPhrase('foobar', 'foo')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsPhrase('The Quick Brown Fox', 'quick BROWN fox')).toBe(true);
  });

  it('handles single-word phrases', () => {
    expect(containsPhrase('foo bar baz', 'bar')).toBe(true);
    expect(containsPhrase('foo bar baz', 'qux')).toBe(false);
  });

  it('returns true for empty phrases (vacuously true)', () => {
    expect(containsPhrase('anything', '')).toBe(true);
  });

  it('returns false when the text is shorter than the phrase', () => {
    expect(containsPhrase('foo', 'foo bar baz')).toBe(false);
  });
});

describe('executeQuery', () => {
  function buildIndex() {
    const opts = SearchIndexService.getMiniSearchOptions();
    const index = new MiniSearch(opts);
    const records = [
      {
        id: 'A',
        docId: 'Pages/a',
        collection: 'Pages',
        slug: 'a',
        deepKey: 'fields.body',
        fieldType: 'richtext',
        fieldLabel: 'Body',
        text: 'The quick brown fox jumps over the lazy dog',
      },
      {
        id: 'B',
        docId: 'Pages/b',
        collection: 'Pages',
        slug: 'b',
        deepKey: 'fields.body',
        fieldType: 'richtext',
        fieldLabel: 'Body',
        text: 'A brown bag full of quick snacks',
      },
      {
        id: 'C',
        docId: 'Pages/c',
        collection: 'Pages',
        slug: 'c',
        deepKey: 'fields.title',
        fieldType: 'string',
        fieldLabel: 'Title',
        text: 'Quick brown fox',
      },
      {
        id: 'D',
        docId: 'Pages/d',
        collection: 'Pages',
        slug: 'd',
        deepKey: 'fields.body',
        fieldType: 'richtext',
        fieldLabel: 'Body',
        text: 'Just a slow turtle',
      },
    ];
    index.addAll(records.map(withWeight));
    return index;
  }

  it('returns no hits for an empty query', () => {
    const index = buildIndex();
    expect(executeQuery(index, parseQuery(''))).toEqual([]);
  });

  it('AND-combines unquoted terms (narrows results)', () => {
    const index = buildIndex();
    // `lazy` only appears in A; `quick` is in A, B, C. With AND, only A
    // satisfies both — under the prior OR default, B and C would also match.
    const ids = executeQuery(index, parseQuery('quick lazy')).map((r) => r.id);
    expect(ids).toEqual(['A']);
  });

  it('phrases require contiguous tokens', () => {
    const index = buildIndex();
    // `B` contains both `brown` and `quick`, but not as the phrase
    // "quick brown" — only A and C do.
    const ids = executeQuery(index, parseQuery('"quick brown"')).map(
      (r) => r.id
    );
    expect(ids).toEqual(expect.arrayContaining(['A', 'C']));
    expect(ids).not.toContain('B');
    expect(ids).not.toContain('D');
  });

  it('phrases disable fuzzy/prefix matching', () => {
    const index = buildIndex();
    // `quic` would normally prefix-match `quick` and surface A/B/C, but a
    // quoted phrase should require the literal token.
    const looseIds = executeQuery(index, parseQuery('quic')).map((r) => r.id);
    expect(looseIds.length).toBeGreaterThan(0);
    const exactIds = executeQuery(index, parseQuery('"quic"')).map((r) => r.id);
    expect(exactIds).toEqual([]);
  });

  it('combines phrases with bare terms (AND)', () => {
    const index = buildIndex();
    const ids = executeQuery(index, parseQuery('"quick brown" jumps')).map(
      (r) => r.id
    );
    // Only A has both the phrase AND the term `jumps`.
    expect(ids).toEqual(['A']);
  });

  it('excludes docs matching `-term`', () => {
    const index = buildIndex();
    const all = executeQuery(index, parseQuery('brown')).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    const filtered = executeQuery(index, parseQuery('brown -lazy')).map(
      (r) => r.id
    );
    expect(filtered).not.toContain('A');
    expect(filtered).toEqual(expect.arrayContaining(['B', 'C']));
  });

  it('excludes docs matching `-"phrase"`', () => {
    const index = buildIndex();
    const filtered = executeQuery(
      index,
      parseQuery('brown -"quick brown"')
    ).map((r) => r.id);
    // A and C contain the phrase "quick brown" — they must be excluded.
    expect(filtered).not.toContain('A');
    expect(filtered).not.toContain('C');
    expect(filtered).toContain('B');
  });

  it('returns no hits for queries with only exclusions', () => {
    const index = buildIndex();
    expect(executeQuery(index, parseQuery('-foo'))).toEqual([]);
  });

  it('returns both title and body matches for a phrase search', () => {
    const index = buildIndex();
    const ids = executeQuery(index, parseQuery('"quick brown"')).map(
      (r) => r.id
    );
    // The phrase appears in A (body) and C (title); B has the words but
    // out of order, so it must be excluded.
    expect(ids).toEqual(expect.arrayContaining(['A', 'C']));
    expect(ids).not.toContain('B');
  });
});
