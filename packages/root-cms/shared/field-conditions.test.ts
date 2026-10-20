import {describe, expect, it} from 'vitest';
import {getSiblingDeepKey, testShowWhen} from './field-conditions.js';

describe('getSiblingDeepKey', () => {
  it('resolves sibling paths relative to the field', () => {
    expect(getSiblingDeepKey('fields.hero.title', 'cta._type')).toBe(
      'fields.hero.cta._type'
    );
    expect(getSiblingDeepKey('fields.title', 'enabled')).toBe('fields.enabled');
  });
});

describe('testShowWhen', () => {
  const data: Record<string, any> = {
    enabled: true,
    disabled: false,
    media: {_type: 'Video'},
    tags: [],
  };
  const get = (path: string) =>
    path.split('.').reduce((value, key) => value?.[key], data as any);

  it('shows fields without conditions', () => {
    expect(testShowWhen(undefined, get)).toBe(true);
  });

  it('tests truthiness when no operator is set', () => {
    expect(testShowWhen({field: 'enabled'}, get)).toBe(true);
    expect(testShowWhen({field: 'disabled'}, get)).toBe(false);
    expect(testShowWhen({field: 'missing'}, get)).toBe(false);
  });

  it('compares nested sibling values', () => {
    expect(testShowWhen({field: 'media._type', equals: 'Video'}, get)).toBe(
      true
    );
    expect(testShowWhen({field: 'media._type', equals: 'Image'}, get)).toBe(
      false
    );
    expect(testShowWhen({field: 'media._type', notEquals: 'Image'}, get)).toBe(
      true
    );
    expect(
      testShowWhen({field: 'media._type', in: ['Image', 'Video']}, get)
    ).toBe(true);
    expect(testShowWhen({field: 'media._type', notIn: ['Video']}, get)).toBe(
      false
    );
  });

  it('supports exists checks', () => {
    expect(testShowWhen({field: 'tags', exists: true}, get)).toBe(false);
    expect(testShowWhen({field: 'tags', exists: false}, get)).toBe(true);
    expect(testShowWhen({field: 'media', exists: true}, get)).toBe(true);
  });

  it('requires all conditions to match', () => {
    const showWhen = [
      {field: 'enabled'},
      {field: 'media._type', equals: 'Image'},
    ];
    expect(testShowWhen(showWhen, get)).toBe(false);
  });
});
