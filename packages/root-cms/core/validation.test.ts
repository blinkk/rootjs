import {describe, it, expect} from 'vitest';
import {validateDoc, validateField} from './validation.js';
import {Schema, Field} from './schema.js';

describe('validation', () => {
  describe('validateField', () => {
    it('validates string', () => {
      const field: Field = {type: 'string', id: 'foo'};
      expect(validateField('bar', field)).toEqual([]);
      expect(validateField(123, field)).toEqual([
        'Expected string, got number',
      ]);
    });

    it('validates number', () => {
      const field: Field = {type: 'number', id: 'foo'};
      expect(validateField(123, field)).toEqual([]);
      expect(validateField('bar', field)).toEqual([
        'Expected number, got string',
      ]);
    });

    it('validates boolean', () => {
      const field: Field = {type: 'boolean', id: 'foo'};
      expect(validateField(true, field)).toEqual([]);
      expect(validateField('bar', field)).toEqual([
        'Expected boolean, got string',
      ]);
    });

    it('validates image', () => {
      const field: Field = {type: 'image', id: 'foo'};
      expect(validateField({src: 'foo.jpg'}, field)).toEqual([]);
      expect(validateField({src: 123}, field)).toEqual([
        'Image missing "src" string',
      ]);
      expect(validateField('foo', field)).toEqual([
        'Expected object (image), got string',
      ]);
    });

    it('validates object', () => {
      const field: Field = {
        type: 'object',
        id: 'foo',
        fields: [{type: 'string', id: 'bar'}],
      };
      expect(validateField({bar: 'baz'}, field)).toEqual([]);
      expect(validateField({bar: 123}, field)).toEqual([
        'bar: Expected string, got number',
      ]);
    });

    it('validates array', () => {
      const field: Field = {
        type: 'array',
        id: 'foo',
        of: {type: 'string', id: 'item'},
      };
      expect(validateField(['a', 'b'], field)).toEqual([]);
      expect(validateField(['a', 123], field)).toEqual([
        '[1]: Expected string, got number',
      ]);
    });

    it('validates oneof', () => {
      const field: Field = {
        type: 'oneof',
        id: 'foo',
        types: [
          {
            name: 'foo',
            fields: [{type: 'string', id: 'bar'}],
          },
        ],
      };
      expect(validateField({_type: 'foo', bar: 'baz'}, field)).toEqual([]);
      expect(validateField({_type: 'foo', bar: 123}, field)).toEqual([
        'foo.bar: Expected string, got number',
      ]);
      expect(validateField({_type: 'unknown'}, field)).toEqual([
        'Unknown OneOf type: "unknown"',
      ]);
    });
  });

  describe('validateDoc', () => {
    it('validates a document', () => {
      const schema: Schema = {
        name: 'MyDoc',
        fields: [
          {type: 'string', id: 'title'},
          {type: 'number', id: 'count'},
        ],
      };

      const validDoc = {
        fields: {
          title: 'Hello',
          count: 123,
        },
      };
      expect(validateDoc(validDoc, schema)).toEqual({valid: true, errors: []});

      const invalidDoc = {
        fields: {
          title: 123,
          count: 'many',
        },
      };
      expect(validateDoc(invalidDoc, schema)).toEqual({
        valid: false,
        errors: [
          {path: 'title', message: 'Expected string, got number'},
          {path: 'count', message: 'Expected number, got string'},
        ],
      });
    });
  });
});
