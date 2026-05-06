/**
 * Smoke tests for SearchIndexService building blocks. Heavy Firestore-backed
 * integration is exercised at runtime via the cron job and the manual rebuild
 * button — the in-memory MiniSearch portion is what's covered here.
 */

import MiniSearch from 'minisearch';
import {describe, it, expect} from 'vitest';
import * as schema from './schema.js';
import {extractDocRecords} from './search-extract.js';
import {
  SearchIndexService,
  isCollectionIndexable,
  isDocIndexable,
  isTitleyDeepKey,
  resolveSearchIndexFilters,
  withWeight,
} from './search-index.js';

describe('search index filters', () => {
  it('treats unset/empty config as "index everything"', () => {
    const filters = resolveSearchIndexFilters(undefined);
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
    expect(isCollectionIndexable(filters, 'Posts')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
  });

  it('treats empty arrays as unset (does not exclude everything)', () => {
    const filters = resolveSearchIndexFilters({
      includeCollections: [],
      includeDocIds: [],
    });
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
  });

  it('respects includeCollections allowlist', () => {
    const filters = resolveSearchIndexFilters({
      includeCollections: ['Pages'],
    });
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
    expect(isCollectionIndexable(filters, 'Posts')).toBe(false);
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
    expect(isDocIndexable(filters, 'Posts/hello')).toBe(false);
  });

  it('respects excludeCollections denylist', () => {
    const filters = resolveSearchIndexFilters({
      excludeCollections: ['Drafts'],
    });
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
    expect(isCollectionIndexable(filters, 'Drafts')).toBe(false);
    expect(isDocIndexable(filters, 'Drafts/foo')).toBe(false);
  });

  it('applies excludeCollections after includeCollections', () => {
    const filters = resolveSearchIndexFilters({
      includeCollections: ['Pages', 'Posts'],
      excludeCollections: ['Posts'],
    });
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
    expect(isCollectionIndexable(filters, 'Posts')).toBe(false);
    expect(isCollectionIndexable(filters, 'Other')).toBe(false);
  });

  it('respects includeDocIds allowlist', () => {
    const filters = resolveSearchIndexFilters({
      includeDocIds: ['Pages/home', 'Pages/about'],
    });
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/about')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/contact')).toBe(false);
    // Collections are still indexable; only the doc-level filter narrows.
    expect(isCollectionIndexable(filters, 'Pages')).toBe(true);
  });

  it('respects excludeDocIds denylist', () => {
    const filters = resolveSearchIndexFilters({
      excludeDocIds: ['Pages/secret'],
    });
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/secret')).toBe(false);
  });

  it('combines collection and doc-id filters', () => {
    const filters = resolveSearchIndexFilters({
      includeCollections: ['Pages'],
      excludeDocIds: ['Pages/secret'],
    });
    expect(isDocIndexable(filters, 'Pages/home')).toBe(true);
    expect(isDocIndexable(filters, 'Pages/secret')).toBe(false);
    expect(isDocIndexable(filters, 'Posts/hello')).toBe(false);
  });

  it('rejects malformed doc ids (no slash)', () => {
    const filters = resolveSearchIndexFilters(undefined);
    expect(isDocIndexable(filters, 'no-slash')).toBe(false);
  });
});

describe('isTitleyDeepKey', () => {
  it('matches title-like terminal segments case-insensitively', () => {
    expect(isTitleyDeepKey('fields.title')).toBe(true);
    expect(isTitleyDeepKey('fields.meta.Title')).toBe(true);
    expect(isTitleyDeepKey('fields.list.k1.name')).toBe(true);
    expect(isTitleyDeepKey('fields.headline')).toBe(true);
    expect(isTitleyDeepKey('fields.slug')).toBe(true);
    expect(isTitleyDeepKey('fields.label')).toBe(true);
  });

  it('returns false for non-title fields', () => {
    expect(isTitleyDeepKey('fields.body')).toBe(false);
    expect(isTitleyDeepKey('fields.description')).toBe(false);
    expect(isTitleyDeepKey('fields.list.k1.body')).toBe(false);
  });
});

describe('withWeight', () => {
  it('boosts title-like records', () => {
    expect(
      withWeight({
        id: 'X/1#fields.title',
        docId: 'X/1',
        collection: 'X',
        slug: '1',
        deepKey: 'fields.title',
        fieldType: 'string',
        fieldLabel: 'Title',
        text: 'Welcome',
      })
    ).toMatchObject({weight: 2});
    expect(
      withWeight({
        id: 'X/1#fields.body',
        docId: 'X/1',
        collection: 'X',
        slug: '1',
        deepKey: 'fields.body',
        fieldType: 'richtext',
        fieldLabel: 'Body',
        text: 'lorem',
      })
    ).toMatchObject({weight: 1});
  });
});

describe('MiniSearch round-trip with extracted records', () => {
  const PageSchema = schema.define({
    name: 'Page',
    fields: [
      schema.string({id: 'title', label: 'Title'}),
      schema.richtext({id: 'body', label: 'Body'}),
    ],
  });

  function buildIndex() {
    const opts = SearchIndexService.getMiniSearchOptions();
    const index = new MiniSearch(opts);
    const docs = [
      extractDocRecords(PageSchema, {
        collection: 'Pages',
        slug: 'home',
        fields: {
          title: 'Welcome home',
          body: {
            blocks: [{type: 'paragraph', data: {text: 'The quick brown fox'}}],
          },
        },
      }),
      extractDocRecords(PageSchema, {
        collection: 'Pages',
        slug: 'about',
        fields: {
          title: 'About us',
          body: {
            blocks: [
              {type: 'paragraph', data: {text: 'A page about our team'}},
            ],
          },
        },
      }),
    ].flat();
    index.addAll(docs.map(withWeight));
    return {index, docs};
  }

  it('indexes records and returns the expected hits', () => {
    const {index} = buildIndex();
    const hits = index.search('welcome');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      docId: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
    });
  });

  it('survives a toJSON / loadJSON round-trip', () => {
    const {index} = buildIndex();
    const json = JSON.stringify(index.toJSON());
    const reloaded = MiniSearch.loadJSON(
      json,
      SearchIndexService.getMiniSearchOptions()
    );
    const hits = reloaded.search('fox');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({deepKey: 'fields.body'});
  });

  it('discard + addAll replaces a doc cleanly', () => {
    const {index, docs} = buildIndex();
    const homeIds = docs
      .filter((r) => r.docId === 'Pages/home')
      .map((r) => r.id);
    for (const id of homeIds) {
      index.discard(id);
    }
    // Re-add with new title.
    const updated = extractDocRecords(PageSchema, {
      collection: 'Pages',
      slug: 'home',
      fields: {title: 'Goodbye home', body: {blocks: []}},
    }).map(withWeight);
    index.addAll(updated);

    const beforeHits = index.search('welcome');
    expect(beforeHits.length).toBe(0);
    const afterHits = index.search('goodbye');
    expect(afterHits.length).toBeGreaterThan(0);
    expect(afterHits[0]).toMatchObject({docId: 'Pages/home'});
  });

  it('boosts title-like fields above body matches', () => {
    const {index} = buildIndex();
    const all = index.search('about');
    expect(all.length).toBeGreaterThan(0);
    const top = all[0];
    expect(top.deepKey).toBe('fields.title');
  });
});
