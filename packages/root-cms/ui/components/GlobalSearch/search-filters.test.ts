import {describe, expect, it} from 'vitest';
import {
  buildGlobalSearchUrl,
  parseGlobalSearchFilter,
  readGlobalSearchUrlState,
  writeGlobalSearchUrlState,
} from './search-filters.js';

describe('parseGlobalSearchFilter', () => {
  it('returns known filters as-is', () => {
    expect(parseGlobalSearchFilter('docs')).toBe('docs');
    expect(parseGlobalSearchFilter('data-sources')).toBe('data-sources');
  });

  it('falls back to "all" for unknown or empty values', () => {
    expect(parseGlobalSearchFilter('bogus')).toBe('all');
    expect(parseGlobalSearchFilter('')).toBe('all');
    expect(parseGlobalSearchFilter(null)).toBe('all');
    expect(parseGlobalSearchFilter(undefined)).toBe('all');
  });
});

describe('readGlobalSearchUrlState', () => {
  it('returns null when the modal param is missing or different', () => {
    expect(readGlobalSearchUrlState('')).toBeNull();
    expect(readGlobalSearchUrlState('?q=foo')).toBeNull();
    expect(readGlobalSearchUrlState('?modal=localization&q=foo')).toBeNull();
  });

  it('reads the query and filter', () => {
    expect(readGlobalSearchUrlState('?modal=search&q=hello+world')).toEqual({
      query: 'hello world',
      filter: 'all',
    });
    expect(
      readGlobalSearchUrlState('?modal=search&q=foo&type=releases')
    ).toEqual({query: 'foo', filter: 'releases'});
  });

  it('opens with an empty query when q is missing', () => {
    expect(readGlobalSearchUrlState('?modal=search')).toEqual({
      query: '',
      filter: 'all',
    });
  });

  it('ignores unknown filters', () => {
    expect(readGlobalSearchUrlState('?modal=search&type=nope')).toEqual({
      query: '',
      filter: 'all',
    });
  });
});

describe('writeGlobalSearchUrlState', () => {
  it('adds the search params while preserving unrelated params', () => {
    expect(
      writeGlobalSearchUrlState('?deeplink=fields.title', {
        query: 'foo bar',
        filter: 'docs',
      })
    ).toBe('?deeplink=fields.title&modal=search&q=foo+bar&type=docs');
  });

  it('omits q and type when they are at their defaults', () => {
    expect(writeGlobalSearchUrlState('', {query: '', filter: 'all'})).toBe(
      '?modal=search'
    );
  });

  it('replaces existing search params', () => {
    expect(
      writeGlobalSearchUrlState('?modal=search&q=old&type=fields', {
        query: 'new',
        filter: 'all',
      })
    ).toBe('?modal=search&q=new');
  });

  it('removes the search params when state is null', () => {
    expect(
      writeGlobalSearchUrlState('?modal=search&q=foo&type=docs', null)
    ).toBe('');
    expect(
      writeGlobalSearchUrlState('?deeplink=x&modal=search&q=foo', null)
    ).toBe('?deeplink=x');
  });

  it('round trips with readGlobalSearchUrlState', () => {
    const state = {query: 'a "quoted" -phrase', filter: 'fields' as const};
    expect(
      readGlobalSearchUrlState(writeGlobalSearchUrlState('', state))
    ).toEqual(state);
  });
});

describe('buildGlobalSearchUrl', () => {
  it('builds a shareable CMS path', () => {
    expect(buildGlobalSearchUrl({query: 'foo', filter: 'all'})).toBe(
      '/cms/?modal=search&q=foo'
    );
    expect(buildGlobalSearchUrl({query: 'foo', filter: 'releases'})).toBe(
      '/cms/?modal=search&q=foo&type=releases'
    );
  });
});
