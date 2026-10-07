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
