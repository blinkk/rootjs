import {describe, it, expect} from 'vitest';
import {
  getNestedValue,
  sortObjectKeysDeep,
  stableJsonStringify,
} from './objects.js';

describe('getNestedValue', () => {
  it('returns a nested property when using dot notation', () => {
    const data = {meta: {title: 'Foo'}};

    expect(getNestedValue(data, 'meta.title')).toBe('Foo');
  });

  it('returns the first defined value from a list of keys', () => {
    const data = {meta: {title: 'Foo', description: 'Bar'}};

    expect(
      getNestedValue(data, ['meta.missing', 'meta.description', 'meta.title'])
    ).toBe('Bar');
  });

  it('resolves bracket notation against real arrays', () => {
    const data = {items: [{title: 'First'}, {title: 'Second'}]};

    expect(getNestedValue(data, 'items[1].title')).toBe('Second');
  });

  it('resolves bracket notation against array objects using the _array key', () => {
    const data = {
      items: {
        _array: ['item1', 'item2'],
        item1: {title: 'Foo'},
        item2: {title: 'Bar'},
      },
    };

    expect(getNestedValue(data, 'items[0].title')).toBe('Foo');
  });

  it('returns undefined when the array object index does not exist', () => {
    const data = {
      items: {
        _array: ['item1'],
        item1: {title: 'Foo'},
      },
    };

    expect(getNestedValue(data, 'items[1].title')).toBeUndefined();
  });
});

describe('sortObjectKeysDeep', () => {
  it('sorts nested object keys but preserves array order', () => {
    const data = {
      z: 1,
      a: {
        d: 4,
        b: 2,
      },
      items: [
        {
          z: 1,
          a: 2,
        },
        {
          b: 1,
          a: 2,
        },
      ],
    };

    expect(sortObjectKeysDeep(data)).toEqual({
      a: {
        b: 2,
        d: 4,
      },
      items: [
        {
          a: 2,
          z: 1,
        },
        {
          a: 2,
          b: 1,
        },
      ],
      z: 1,
    });
  });
});

describe('stableJsonStringify', () => {
  it('returns the same string for different key insertion orders', () => {
    const before = {
      block: {
        type: 'html',
        data: {
          html: '<p>Hello</p>',
        },
      },
    };
    const after = {
      block: {
        data: {
          html: '<p>Hello</p>',
        },
        type: 'html',
      },
    };

    expect(stableJsonStringify(before)).toBe(stableJsonStringify(after));
  });
});
