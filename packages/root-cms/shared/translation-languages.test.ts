import {describe, it, expect} from 'vitest';
import {
  getLocalesForTranslationLanguage,
  getTranslationForLanguage,
  getTranslationLanguage,
  toTranslationLanguages,
} from './translation-languages.js';

const i18nConfig = {
  locales: ['en', 'fr', 'es-419_mx', 'es-419_co'],
  translationLanguages: {
    'es-419_mx': 'es-419',
    'es-419_co': 'es-419',
  },
};

describe('getTranslationLanguage', () => {
  it('returns the configured translation language for a locale', () => {
    expect(getTranslationLanguage(i18nConfig, 'es-419_mx')).toEqual('es-419');
    expect(getTranslationLanguage(i18nConfig, 'es-419_co')).toEqual('es-419');
  });

  it('matches locales case-insensitively', () => {
    expect(getTranslationLanguage(i18nConfig, 'ES-419_MX')).toEqual('es-419');
  });

  it('returns the locale itself when no mapping is configured', () => {
    expect(getTranslationLanguage(i18nConfig, 'fr')).toEqual('fr');
    expect(getTranslationLanguage({}, 'es-419_mx')).toEqual('es-419_mx');
  });
});

describe('toTranslationLanguages', () => {
  it('dedupes locales that share a translation language', () => {
    expect(toTranslationLanguages(i18nConfig, i18nConfig.locales)).toEqual([
      'en',
      'fr',
      'es-419',
    ]);
  });

  it('returns locales unchanged when no mapping is configured', () => {
    expect(toTranslationLanguages({}, ['en', 'fr'])).toEqual(['en', 'fr']);
  });
});

describe('getLocalesForTranslationLanguage', () => {
  it('expands a translation language to its root locales', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'es-419')).toEqual([
      'es-419_mx',
      'es-419_co',
    ]);
  });

  it('matches a root locale directly', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'fr')).toEqual(['fr']);
    expect(getLocalesForTranslationLanguage(i18nConfig, 'es-419_mx')).toEqual([
      'es-419_mx',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'ES-419')).toEqual([
      'es-419_mx',
      'es-419_co',
    ]);
  });

  it('includes a root locale that matches the language id directly', () => {
    const config = {
      locales: ['en', 'es-419', 'es-419_mx'],
      translationLanguages: {'es-419_mx': 'es-419'},
    };
    expect(getLocalesForTranslationLanguage(config, 'es-419')).toEqual([
      'es-419',
      'es-419_mx',
    ]);
  });

  it('returns an empty array for unknown values', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'de')).toEqual([]);
  });
});

describe('getTranslationForLanguage', () => {
  it('returns the first non-empty translation across the locale group', () => {
    const row = {source: 'Hello', 'es-419_mx': '', 'es-419_co': 'Hola'};
    expect(getTranslationForLanguage(i18nConfig, row, 'es-419')).toEqual(
      'Hola'
    );
  });

  it('reads a root locale directly', () => {
    const row = {source: 'Hello', fr: 'Bonjour'};
    expect(getTranslationForLanguage(i18nConfig, row, 'fr')).toEqual('Bonjour');
  });

  it('returns an empty string when no translation exists', () => {
    expect(getTranslationForLanguage(i18nConfig, {}, 'es-419')).toEqual('');
    expect(getTranslationForLanguage(i18nConfig, {}, 'de')).toEqual('');
  });
});
