import {describe, it, expect} from 'vitest';
import * as schema from '../../../core/schema.js';
import {getDefaultFieldValue} from './fields.js';
import {testFieldEmpty} from './test-field-empty.js';

const badge = schema.object({
  id: 'badge',
  deprecated: true,
  fields: [
    schema.string({id: 'label', translate: true}),
    schema.select({
      id: 'color',
      options: ['yellow', 'blue'],
      default: 'yellow',
    }),
    schema.select({id: 'colorScheme', options: ['light', 'dark']}),
    schema.string({id: 'link'}),
  ],
});

describe('testFieldEmpty', () => {
  it('treats a value matching the default as non-empty by default', () => {
    expect(testFieldEmpty(badge, {color: 'yellow'})).toBe(false);
  });

  describe('ignoreDefaults', () => {
    const options = {ignoreDefaults: true};

    it('treats a nested object holding only defaults as empty', () => {
      const parent = schema.define({name: 'Card', fields: [badge]});
      const value = getDefaultFieldValue(parent).badge as Record<string, any>;
      expect(value).toEqual({color: 'yellow'});
      expect(testFieldEmpty(badge, value, {}, options)).toBe(true);
      expect(
        testFieldEmpty(badge, {...value, label: '', link: ''}, {}, options)
      ).toBe(true);
    });

    it('treats a non-default value as non-empty', () => {
      expect(testFieldEmpty(badge, {color: 'blue'}, {}, options)).toBe(false);
      expect(
        testFieldEmpty(badge, {color: 'yellow', label: 'New'}, {}, options)
      ).toBe(false);
    });

    it('compares array defaults against array-map values', () => {
      const links = schema.array({
        id: 'links',
        of: schema.object({fields: [schema.string({id: 'label'})]}),
        default: [{label: 'a'}, {label: 'b'}],
      });
      const arrayMap = {
        _array: ['k1', 'k2'],
        k1: {label: 'a'},
        k2: {label: 'b'},
      };
      expect(testFieldEmpty(links, arrayMap, {}, options)).toBe(true);
      expect(
        testFieldEmpty(links, [{label: 'a'}, {label: 'b'}], {}, options)
      ).toBe(true);
      expect(
        testFieldEmpty(links, {...arrayMap, k2: {label: 'c'}}, {}, options)
      ).toBe(false);
    });
  });
});
