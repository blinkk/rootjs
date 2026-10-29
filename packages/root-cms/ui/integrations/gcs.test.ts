import {describe, expect, it} from 'vitest';
import {
  IMAGE_EXTS,
  OPT_IN_IMAGE_EXTS,
  PREVIEW_IMAGE_EXTS,
  testFileMatchesAccept,
} from './gcs.js';

describe('image exts', () => {
  it('excludes opt-in exts from the image field defaults', () => {
    expect(IMAGE_EXTS).not.toContain('avif');
    expect(OPT_IN_IMAGE_EXTS).toContain('avif');
    expect(PREVIEW_IMAGE_EXTS).toContain('avif');
  });
});

describe('testFileMatchesAccept', () => {
  it('matches mime types and extensions', () => {
    expect(testFileMatchesAccept('a.png', ['image/png'])).toBe(true);
    expect(testFileMatchesAccept('a.png', ['.png'])).toBe(true);
    expect(testFileMatchesAccept('a.png', ['image/webp'])).toBe(false);
  });

  it('excludes avif from the image/* wildcard (opt-in only)', () => {
    expect(testFileMatchesAccept('a.avif', ['image/*'])).toBe(false);
    expect(testFileMatchesAccept('a.png', ['image/*'])).toBe(true);
  });

  it('matches avif when a field opts in', () => {
    expect(testFileMatchesAccept('a.avif', ['image/avif'])).toBe(true);
    expect(testFileMatchesAccept('a.avif', ['.avif'])).toBe(true);
    expect(testFileMatchesAccept('a.avif', ['*'])).toBe(true);
  });
});
