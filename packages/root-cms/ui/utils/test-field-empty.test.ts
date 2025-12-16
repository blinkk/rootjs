import {describe, it, expect} from 'vitest';
import {Field, ObjectField} from '../../core/schema.js';
import {testFieldEmpty} from './test-field-empty.js';

describe('testFieldEmpty', () => {
  const objectField: ObjectField = {
    type: 'object',
    fields: [
      {type: 'string', id: 'foo'},
      {type: 'string', id: 'bar'},
    ],
  };

  const arrayField: Field = {
    type: 'array',
    of: objectField,
  };

  describe('array', () => {
    it('should return false for a plain non-empty array', () => {
      const plainArray = [{foo: 'a'}, {foo: 'b'}];
      expect(testFieldEmpty(arrayField, plainArray)).toBe(false);
    });

    it('should return true for an empty array', () => {
      const emptyArray: any[] = [];
      expect(testFieldEmpty(arrayField, emptyArray)).toBe(true);
    });

    it('should return false for a normalized non-empty array', () => {
      const normalizedArray = {_array: ['id1'], id1: {foo: 'a'}};
      expect(testFieldEmpty(arrayField, normalizedArray)).toBe(false);
    });

    it('should return true for a normalized array with empty items', () => {
      const normalizedArray = {_array: ['id1'], id1: {foo: ''}};
      expect(testFieldEmpty(arrayField, normalizedArray)).toBe(true);
    });
  });

  describe('object', () => {
    it('should return true for an empty object', () => {
      expect(testFieldEmpty(objectField, {})).toBe(true);
    });

    it('should return true for an object with empty fields', () => {
      expect(testFieldEmpty(objectField, {foo: '', bar: ''})).toBe(true);
    });

    it('should return false for an object with non-empty fields', () => {
      expect(testFieldEmpty(objectField, {foo: 'hello'})).toBe(false);
    });
  });
});
