import {describe, it, expect} from 'vitest';
import {getNestedValue} from './objects.js';

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
