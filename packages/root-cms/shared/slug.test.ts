import {describe, it, expect} from 'vitest';
import {isSlugValid, normalizeSlug} from './slug.js';

describe('isSlugValid', () => {
  it('validates good slugs', () => {
    expect(isSlugValid('1')).toBe(true);
    expect(isSlugValid('a')).toBe(true);
    expect(isSlugValid('foo')).toBe(true);
    expect(isSlugValid('foo-bar')).toBe(true);
    expect(isSlugValid('foo--bar')).toBe(true);
    expect(isSlugValid('foo-bar-123')).toBe(true);
    expect(isSlugValid('foo--bar--123')).toBe(true);
    expect(isSlugValid('foo_bar')).toBe(true);
    expect(isSlugValid('foo_bar-123')).toBe(true);
    expect(isSlugValid('_foo_bar-123')).toBe(true);
  });

  it('invalidates bad slugs', () => {
    expect(isSlugValid('Foo')).toBe(false);
    expect(isSlugValid('-asdf-')).toBe(false);
    expect(isSlugValid('-a!!')).toBe(false);
    expect(isSlugValid('!!a')).toBe(false);
    expect(isSlugValid('/foo')).toBe(false);
    expect(isSlugValid('--foo--bar')).toBe(false);
  });
});

describe('normalizeSlug', () => {
  it('converts / to --', () => {
    expect(normalizeSlug('foo')).toEqual('foo');
    expect(normalizeSlug('foo/bar')).toEqual('foo--bar');
    expect(normalizeSlug('foo/bar/baz')).toEqual('foo--bar--baz');
  });

  it('removes whitespace', () => {
    expect(normalizeSlug('  foo  ')).toEqual('foo');
    expect(normalizeSlug('  foo/bar  ')).toEqual('foo--bar');
    expect(normalizeSlug('  foo/bar/baz  ')).toEqual('foo--bar--baz');
  });
});
