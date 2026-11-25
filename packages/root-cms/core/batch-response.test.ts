import {describe, expect, it} from 'vitest';
import {BatchResponse, DataSourceData, Doc} from './client.js';

function testDoc(id: string): Doc {
  const [collection, slug] = id.split('/');
  return {
    id,
    collection,
    slug,
    sys: {
      createdAt: 0,
      createdBy: 'test',
      modifiedAt: 0,
      modifiedBy: 'test',
      locales: ['en'],
    },
    fields: {title: id},
  } as Doc;
}

describe('BatchResponse getters', () => {
  it('returns docs by id', () => {
    const res = new BatchResponse();
    res.docs['Global/header'] = testDoc('Global/header');
    expect(res.getDoc('Global/header')?.fields.title).toBe('Global/header');
    expect(res.getDoc('Global/footer')).toBeNull();
  });

  it('matches doc ids with either slug form', () => {
    const res = new BatchResponse();
    res.docs['Pages/foo/bar'] = testDoc('Pages/foo--bar');
    res.docs['Pages/baz--qux'] = testDoc('Pages/baz--qux');
    expect(res.getDoc('Pages/foo/bar')).toBe(res.docs['Pages/foo/bar']);
    expect(res.getDoc('Pages/foo--bar')).toBe(res.docs['Pages/foo/bar']);
    expect(res.getDoc('Pages/baz/qux')).toBe(res.docs['Pages/baz--qux']);
  });

  it('returns null for invalid doc ids', () => {
    const res = new BatchResponse();
    expect(res.getDoc('not-a-doc-id')).toBeNull();
  });

  it('returns query results, or an empty array', () => {
    const res = new BatchResponse();
    res.queries.posts = [testDoc('BlogPosts/a'), testDoc('BlogPosts/b')];
    expect(res.getQuery('posts').map((doc) => doc.id)).toEqual([
      'BlogPosts/a',
      'BlogPosts/b',
    ]);
    expect(res.getQuery('missing')).toEqual([]);
  });

  it('returns data sources by id', () => {
    const res = new BatchResponse();
    const pricing = {data: [{plan: 'pro'}]} as DataSourceData;
    res.dataSources.pricing = pricing;
    expect(res.getDataSource('pricing')).toBe(pricing);
    expect(res.getDataSource('missing')).toBeNull();
  });
});

describe('BatchResponse.getTranslations', () => {
  it('returns an empty object when no translations exist', () => {
    const res = new BatchResponse();
    expect(res.getTranslations(['fr-CA', 'fr', 'en'])).toEqual({});
  });

  it('resolves fallback locales, doc precedence, and source fallbacks', () => {
    const res = new BatchResponse();
    res.translations = {
      common: {
        'fr-CA': {
          id: 'common',
          locale: 'fr-CA',
          strings: {
            h1: {source: 'Hello', translation: 'Allô (common)'},
            h2: {source: 'Goodbye', translation: ''},
            h3: {source: 'Title', translation: 'Titre CA (common)'},
          },
        },
        fr: {
          id: 'common',
          locale: 'fr',
          strings: {
            h1: {source: 'Hello', translation: 'Bonjour (common)'},
            h2: {source: 'Goodbye', translation: 'Au revoir (common)'},
            h3: {source: 'Title', translation: 'Titre FR (common)'},
            h4: {source: 'Untranslated', translation: ''},
          },
        },
        de: {
          id: 'common',
          locale: 'de',
          strings: {
            h5: {source: 'German only', translation: 'Nur Deutsch'},
          },
        },
      },
      'Pages/home': {
        'fr-CA': {
          id: 'Pages/home',
          locale: 'fr-CA',
          strings: {
            // Empty translation in later doc must not clobber earlier doc.
            h1: {source: 'Hello', translation: ''},
            // Non-empty translation in later doc overrides earlier doc.
            h3: {source: 'Title', translation: 'Titre CA (home)'},
          },
        },
        fr: {
          id: 'Pages/home',
          locale: 'fr',
          strings: {
            // Lower-priority locale in later doc must not beat higher-priority
            // locale (`fr-CA`) from earlier doc.
            h1: {source: 'Hello', translation: 'Salut (home)'},
            h2: {source: 'Goodbye', translation: 'À bientôt (home)'},
          },
        },
      },
    };

    expect(res.getTranslations(['fr-CA', 'fr', 'en'])).toEqual({
      Hello: 'Allô (common)',
      Goodbye: 'À bientôt (home)',
      Title: 'Titre CA (home)',
      Untranslated: 'Untranslated',
      'German only': 'German only',
    });
  });

  it('expands a single locale via i18nConfig fallbacks', () => {
    const res = new BatchResponse({
      locales: ['en', 'fr', 'fr-CA'],
      fallbacks: {'fr-CA': ['fr', 'en']},
    });
    res.translations = {
      common: {
        fr: {
          id: 'common',
          locale: 'fr',
          strings: {
            h1: {source: 'Save', translation: 'Enregistrer'},
          },
        },
      },
    };
    expect(res.getTranslations('fr-CA')).toEqual({Save: 'Enregistrer'});
  });
});
