import {describe, it, expect} from 'vitest';
import {
  getLocalesForTranslationLanguage,
  getTranslationForLanguage,
  getTranslationLanguage,
  toTranslationLanguages,
} from './translation-languages.js';

const i18nConfig = {
  locales: ['en', 'fr', 'es_mx', 'es_co', 'en_gb', 'en_ca', 'fr_ca'],
  translationLanguages: {
    es_mx: 'es-419',
    es_co: 'es-419',
    en_gb: 'en-GB',
    en_ca: 'en-GB',
    fr_ca: 'fr-CA',
  },
};

describe('getTranslationLanguage', () => {
  it('returns the configured translation language for a locale', () => {
    expect(getTranslationLanguage(i18nConfig, 'es_mx')).toEqual('es-419');
    expect(getTranslationLanguage(i18nConfig, 'es_co')).toEqual('es-419');
    expect(getTranslationLanguage(i18nConfig, 'en_gb')).toEqual('en-GB');
    expect(getTranslationLanguage(i18nConfig, 'fr_ca')).toEqual('fr-CA');
  });

  it('matches locales case-insensitively', () => {
    expect(getTranslationLanguage(i18nConfig, 'ES_MX')).toEqual('es-419');
  });

  it('returns the locale itself when no mapping is configured', () => {
    expect(getTranslationLanguage(i18nConfig, 'fr')).toEqual('fr');
    expect(getTranslationLanguage({}, 'es_mx')).toEqual('es_mx');
  });
});

describe('toTranslationLanguages', () => {
  it('dedupes locales that share a translation language', () => {
    expect(toTranslationLanguages(i18nConfig, i18nConfig.locales)).toEqual([
      'en',
      'fr',
      'es-419',
      'en-GB',
      'fr-CA',
    ]);
  });

  it('returns locales unchanged when no mapping is configured', () => {
    expect(toTranslationLanguages({}, ['en', 'fr'])).toEqual(['en', 'fr']);
  });
});

describe('getLocalesForTranslationLanguage', () => {
  it('expands a translation language to its root locales', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'es-419')).toEqual([
      'es_mx',
      'es_co',
    ]);
    expect(getLocalesForTranslationLanguage(i18nConfig, 'en-GB')).toEqual([
      'en_gb',
      'en_ca',
    ]);
    expect(getLocalesForTranslationLanguage(i18nConfig, 'fr-CA')).toEqual([
      'fr_ca',
    ]);
  });

  it('matches a root locale directly', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'fr')).toEqual(['fr']);
    expect(getLocalesForTranslationLanguage(i18nConfig, 'es_mx')).toEqual([
      'es_mx',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'ES-419')).toEqual([
      'es_mx',
      'es_co',
    ]);
  });

  it('includes a root locale that matches the language id directly', () => {
    const config = {
      locales: ['en', 'es-419', 'es_mx'],
      translationLanguages: {es_mx: 'es-419'},
    };
    expect(getLocalesForTranslationLanguage(config, 'es-419')).toEqual([
      'es-419',
      'es_mx',
    ]);
  });

  it('returns an empty array for unknown values', () => {
    expect(getLocalesForTranslationLanguage(i18nConfig, 'de')).toEqual([]);
  });
});

describe('getTranslationForLanguage', () => {
  it('returns the first non-empty translation across the locale group', () => {
    const row = {source: 'Hello', es_mx: '', es_co: 'Hola'};
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
