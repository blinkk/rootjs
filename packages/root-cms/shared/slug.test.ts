import {describe, it, expect} from 'vitest';
import {isSlugValid, getSlugError, normalizeSlug} from './slug.js';

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

describe('getSlugError', () => {
  it('returns empty string for valid slugs', () => {
    expect(getSlugError('foo')).toBe('');
    expect(getSlugError('foo-bar-123')).toBe('');
    expect(getSlugError('foo_bar')).toBe('');
    expect(getSlugError('foo--bar')).toBe('');
  });

  it('returns error for empty slug', () => {
    expect(getSlugError('')).toMatch(/empty/i);
  });

  it('returns error for uppercase letters', () => {
    expect(getSlugError('Foo')).toMatch(/uppercase/i);
  });

  it('returns error for invalid characters', () => {
    expect(getSlugError('foo!bar')).toMatch(/can only contain/i);
  });

  it('returns error for leading dash', () => {
    expect(getSlugError('-foo')).toMatch(/start with a dash/i);
  });

  it('returns error for trailing dash', () => {
    expect(getSlugError('foo-')).toMatch(/end with a dash/i);
  });

  it('returns error for custom pattern mismatch', () => {
    expect(getSlugError('abc', /^[0-9]+$/)).toMatch(/pattern/i);
  });

  it('returns empty string for custom pattern match', () => {
    expect(getSlugError('123', /^[0-9]+$/)).toBe('');
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
