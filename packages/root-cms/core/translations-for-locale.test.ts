import {describe, expect, it} from 'vitest';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {TranslationsMap, translationsForLocale} from './client.js';

const translationsMap: TranslationsMap = {
  hash1: {source: 'Hello', en: 'Hello', 'en-GB': 'Hello (GB)', fr: 'Bonjour'},
  hash2: {source: 'Colour', en: 'Color', 'en-GB': 'Colour'},
  hash3: {source: 'Untranslated', en: ''},
  hash4: {source: 'Only source'},
};

describe('translationsForLocale', () => {
  it('resolves a single locale with en and source fallbacks', () => {
    expect(translationsForLocale(translationsMap, 'fr')).toEqual({
      Hello: 'Bonjour',
      Colour: 'Color',
      Untranslated: 'Untranslated',
      'Only source': 'Only source',
    });
  });

  it('uses the first locale in the fallback chain with a translation', () => {
    expect(
      translationsForLocale(translationsMap, ['en-CA', 'en-GB', 'en'])
    ).toEqual({
      Hello: 'Hello (GB)',
      Colour: 'Colour',
      Untranslated: 'Untranslated',
      'Only source': 'Only source',
    });
  });

  it('falls back to the source string when no locale in the chain matches', () => {
    expect(translationsForLocale(translationsMap, ['de', 'es'])).toEqual({
      Hello: 'Hello',
      Colour: 'Colour',
      Untranslated: 'Untranslated',
      'Only source': 'Only source',
    });
  });

  it('honors the i18n.fallbacks config via resolveLocaleFallbacks()', () => {
    const i18n = {
      locales: ['en', 'en-GB', 'en-CA', 'fr'],
      fallbacks: {'en-CA': ['en-GB']},
    };
    expect(
      translationsForLocale(
        translationsMap,
        resolveLocaleFallbacks(i18n, 'en-CA')
      )
    ).toEqual({
      Hello: 'Hello (GB)',
      Colour: 'Colour',
      Untranslated: 'Untranslated',
      'Only source': 'Only source',
    });
    // Without a configured fallback, the chain is just the locale and the
    // default locale, matching the single-locale behavior.
    expect(
      translationsForLocale(translationsMap, resolveLocaleFallbacks(i18n, 'fr'))
    ).toEqual(translationsForLocale(translationsMap, 'fr'));
  });
});
