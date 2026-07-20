import {describe, expect, it} from 'vitest';
import {resolveLocaleFallbacks} from './locale-fallbacks.js';

describe('resolveLocaleFallbacks', () => {
  it('returns the locale followed by the default locale', () => {
    expect(resolveLocaleFallbacks({}, 'fr')).toEqual(['fr', 'en']);
    expect(resolveLocaleFallbacks(undefined, 'fr')).toEqual(['fr', 'en']);
  });

  it('uses the configured defaultLocale', () => {
    expect(resolveLocaleFallbacks({defaultLocale: 'de'}, 'fr')).toEqual([
      'fr',
      'de',
    ]);
  });

  it('does not duplicate the default locale', () => {
    expect(resolveLocaleFallbacks({}, 'en')).toEqual(['en']);
    expect(resolveLocaleFallbacks({defaultLocale: 'de'}, 'de')).toEqual(['de']);
  });

  it('follows configured fallback chains', () => {
    const i18n = {fallbacks: {'en-CA': ['en-GB']}};
    expect(resolveLocaleFallbacks(i18n, 'en-CA')).toEqual([
      'en-CA',
      'en-GB',
      'en',
    ]);
  });

  it('resolves fallbacks recursively (breadth first)', () => {
    const i18n = {
      fallbacks: {
        'fr-ca': ['fr-fr', 'en-CA'],
        'fr-fr': ['fr'],
        'en-CA': ['en-GB'],
      },
    };
    expect(resolveLocaleFallbacks(i18n, 'fr-ca')).toEqual([
      'fr-ca',
      'fr-fr',
      'en-CA',
      'fr',
      'en-GB',
      'en',
    ]);
  });

  it('matches fallback keys case-insensitively', () => {
    const i18n = {fallbacks: {'EN-ca': ['en-GB']}};
    expect(resolveLocaleFallbacks(i18n, 'en-CA')).toEqual([
      'en-CA',
      'en-GB',
      'en',
    ]);
  });

  it('preserves the configured casing of fallback values', () => {
    const i18n = {fallbacks: {'en-ca': ['EN-gb']}};
    expect(resolveLocaleFallbacks(i18n, 'en-CA')).toEqual([
      'en-CA',
      'EN-gb',
      'en',
    ]);
  });

  it('protects against cycles', () => {
    const i18n = {
      fallbacks: {
        a: ['b'],
        b: ['c'],
        c: ['a'],
      },
    };
    expect(resolveLocaleFallbacks(i18n, 'a')).toEqual(['a', 'b', 'c', 'en']);
  });

  it('protects against self-referencing fallbacks', () => {
    const i18n = {fallbacks: {'en-ca': ['en-CA', 'en-GB']}};
    expect(resolveLocaleFallbacks(i18n, 'en-CA')).toEqual([
      'en-CA',
      'en-GB',
      'en',
    ]);
  });

  it('dedupes shared fallbacks across chains', () => {
    const i18n = {
      fallbacks: {
        'es-mx': ['es-419', 'es'],
        'es-419': ['es'],
      },
    };
    expect(resolveLocaleFallbacks(i18n, 'es-mx')).toEqual([
      'es-mx',
      'es-419',
      'es',
      'en',
    ]);
  });
});
