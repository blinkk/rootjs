import {describe, expect, it} from 'vitest';
import {resolveLocalizedValues} from './localized-values.js';

describe('resolveLocalizedValues', () => {
  const fields = {
    title: 'Hello',
    image: {src: 'en.png'},
    '@image': {
      translate: false,
      localizedValues: {
        'en-GB': {src: 'gb.png'},
        de: {src: 'de.png'},
      },
    },
  };

  it('uses the first locale in the chain with a localized value', () => {
    expect(resolveLocalizedValues(fields, ['en-CA', 'en-GB', 'en'])).toEqual({
      title: 'Hello',
      image: {src: 'gb.png'},
      '@image': {translate: false},
    });
    expect(resolveLocalizedValues(fields, 'DE').image).toEqual({
      src: 'de.png',
    });
    // Falls back to the default value.
    expect(resolveLocalizedValues(fields, ['es', 'en']).image).toEqual({
      src: 'en.png',
    });
  });

  it('resolves nested fields and arrays without mutating the input', () => {
    const input = {
      modules: [
        {_type: 'Hero', title: 'A'},
        {
          _type: 'Promo',
          cta: {label: 'Buy'},
          '@cta': {
            localizedValues: {
              de: {
                label: 'Kaufen',
                icon: 'cart',
                '@icon': {localizedValues: {de: null}},
              },
            },
          },
          // A localized value applies even if the field has no default value.
          '@badge': {localizedValues: {de: 'Neu'}},
        },
      ],
    };
    const snapshot = structuredClone(input);
    const result = resolveLocalizedValues(input, ['de', 'en']);
    expect(result.modules[1]).toEqual({
      _type: 'Promo',
      // `null` overrides the value for the locale.
      cta: {label: 'Kaufen', icon: null},
      badge: 'Neu',
    });
    expect(input).toEqual(snapshot);
    // Unchanged subtrees are not copied.
    expect(result.modules[0]).toBe(input.modules[0]);
    const plain = {a: {b: [1, 2]}};
    expect(resolveLocalizedValues(plain, ['de'])).toBe(plain);
  });

  it('optionally keeps the localized values', () => {
    const result = resolveLocalizedValues(fields, ['de'], {
      keepLocalizedValues: true,
    });
    expect(result.image).toEqual({src: 'de.png'});
    expect(result['@image']).toBe(fields['@image']);
  });
});
