import {describe, it, expect} from 'vitest';
import {Arb} from './arb.js';

describe('Arb', () => {
  it('should add string with metadata', () => {
    const arb = new Arb();
    arb.add('key1', 'Hello World', {
      context: 'Pages/index',
      description: 'Greeting message',
    });

    const result = arb.get('key1');
    expect(result).toEqual({
      source: 'Hello World',
      meta: {
        context: 'Pages/index',
        description: 'Greeting message',
      },
    });
  });

  it('should include translator notes in description', () => {
    const arb = new Arb();
    arb.add('key1', 'Welcome', {
      context: 'Pages/home',
      description: 'Keep it friendly and casual',
    });

    const json = arb.toJson();
    expect(json['@key1']).toEqual({
      context: 'Pages/home',
      description: 'Keep it friendly and casual',
    });
  });

  it('should list all entries with metadata', () => {
    const arb = new Arb();
    arb.add('key1', 'Hello', {context: 'Pages/index'});
    arb.add('key2', 'World', {
      context: 'Pages/about',
      description: 'Planet name',
    });

    const list = arb.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      key: 'key1',
      source: 'Hello',
      meta: {context: 'Pages/index'},
    });
    expect(list[1]).toEqual({
      key: 'key2',
      source: 'World',
      meta: {context: 'Pages/about', description: 'Planet name'},
    });
  });

  it('should handle entries without metadata', () => {
    const arb = new Arb();
    arb.add('key1', 'No metadata');

    const result = arb.get('key1');
    expect(result).toEqual({
      source: 'No metadata',
      meta: undefined,
    });
  });

  it('should merge contexts when adding same key multiple times', () => {
    const arb = new Arb();
    arb.add('key1', 'Hello', {context: 'Pages/index'});

    // Simulating re-adding with new context (as done in TranslationsArbPage)
    const existing = arb.get('key1');
    if (existing?.meta) {
      const contextIds = existing.meta.context!.split(', ');
      contextIds.push('Pages/about');
      contextIds.sort();
      existing.meta.context = contextIds.join(', ');
      arb.add('key1', 'Hello', existing.meta);
    }

    const result = arb.get('key1');
    expect(result?.meta?.context).toBe('Pages/about, Pages/index');
  });
});
