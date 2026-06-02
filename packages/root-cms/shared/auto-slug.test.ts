import {describe, expect, it} from 'vitest';
import {ADJECTIVES, NOUNS} from './auto-slug-words.js';
import {renderAutoSlug} from './auto-slug.js';

const FIXED_DATE = new Date(2026, 5, 2, 9, 7, 5); // 2026-06-02 09:07:05

describe('renderAutoSlug', () => {
  it('returns literal templates unchanged when normalized', () => {
    expect(renderAutoSlug('hello')).toBe('hello');
    expect(renderAutoSlug('foo-bar')).toBe('foo-bar');
  });

  it('renders {date} as YYYYMMDD by default', () => {
    expect(renderAutoSlug('{date}', {now: FIXED_DATE})).toBe('20260602');
  });

  it('renders {date:FORMAT} with the requested format', () => {
    expect(renderAutoSlug('{date:YYYY-MM-DD}', {now: FIXED_DATE})).toBe(
      '2026-06-02'
    );
    expect(renderAutoSlug('{date:YYYYMMDDHHmmss}', {now: FIXED_DATE})).toBe(
      '20260602090705'
    );
    expect(renderAutoSlug('{date:YY}', {now: FIXED_DATE})).toBe('26');
  });

  it('renders {random} with default length of 6 and {random:N} with custom length', () => {
    const a = renderAutoSlug('{random}');
    expect(a).toMatch(/^[a-z0-9]{6}$/);
    const b = renderAutoSlug('{random:12}');
    expect(b).toMatch(/^[a-z0-9]{12}$/);
  });

  it('renders {adjective} and {noun} from the word lists', () => {
    const adj = renderAutoSlug('{adjective}');
    expect(ADJECTIVES).toContain(adj);
    const noun = renderAutoSlug('{noun}');
    expect(NOUNS).toContain(noun);
  });

  it('combines tokens with literal separators', () => {
    const slug = renderAutoSlug('{date:YYYYMMDD}-{adjective}-{noun}', {
      now: FIXED_DATE,
    });
    expect(slug).toMatch(/^20260602-[a-z]+-[a-z]+$/);
  });

  it('leaves unknown tokens untouched', () => {
    expect(renderAutoSlug('post-{unknown}-{date}', {now: FIXED_DATE})).toBe(
      'post-{unknown}-20260602'
    );
  });

  it('normalizes and lowercases the output', () => {
    expect(renderAutoSlug('HELLO/WORLD')).toBe('hello--world');
  });

  it('uses the provided random source deterministically', () => {
    const random = () => 0;
    expect(renderAutoSlug('{adjective}-{noun}', {random})).toBe(
      `${ADJECTIVES[0]}-${NOUNS[0]}`
    );
  });
});
