import {describe, it, expect} from 'vitest';
import {strFormatFn} from './str-format.js';
import {getNestedValue} from './objects.js';

describe('strFormatFn', () => {
  it('replaces placeholders using lookup function', () => {
    const data = {meta: {title: 'Foo'}};
    const result = strFormatFn('{meta.title}', (key) => getNestedValue(data, key));
    expect(result).toBe('Foo');
  });

  it('leaves unknown placeholders untouched', () => {
    const data = {meta: {title: 'Foo'}};
    const result = strFormatFn('{meta.description}', (key) => getNestedValue(data, key));
    expect(result).toBe('{meta.description}');
  });
});
