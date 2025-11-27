import {describe, it, expect} from 'vitest';
import {z} from 'zod';
import {schemaToZod, fieldToZod} from './zod.js';
import {Schema, Field} from './schema.js';

describe('zod conversion', () => {
  describe('fieldToZod', () => {
    it('converts string field', () => {
      const field: Field = {type: 'string', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse('bar').success).toBe(true);
      expect(zodType.safeParse(123).success).toBe(false);
    });

    it('converts number field', () => {
      const field: Field = {type: 'number', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse(123).success).toBe(true);
      expect(zodType.safeParse('bar').success).toBe(false);
    });

    it('converts boolean field', () => {
      const field: Field = {type: 'boolean', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse(true).success).toBe(true);
      expect(zodType.safeParse('bar').success).toBe(false);
    });

    it('converts image field', () => {
      const field: Field = {type: 'image', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse({src: 'foo.jpg'}).success).toBe(true);
      expect(zodType.safeParse({src: 123}).success).toBe(false);
      expect(zodType.safeParse('foo').success).toBe(false);
    });

    it('converts object field', () => {
      const field: Field = {
        type: 'object',
        id: 'foo',
        fields: [{type: 'string', id: 'bar'}],
      };
      const zodType = fieldToZod(field);
      expect(zodType.safeParse({bar: 'baz'}).success).toBe(true);
      expect(zodType.safeParse({bar: 123}).success).toBe(false);
    });

    it('converts array field', () => {
      const field: Field = {
        type: 'array',
        id: 'foo',
        of: {type: 'string', id: 'item'},
      };
      const zodType = fieldToZod(field);
      expect(zodType.safeParse(['a', 'b']).success).toBe(true);
      expect(zodType.safeParse(['a', 123]).success).toBe(false);
    });
  });

  describe('schemaToZod', () => {
    it('converts a full schema', () => {
      const schema: Schema = {
        name: 'MyDoc',
        fields: [
          {type: 'string', id: 'title'},
          {type: 'number', id: 'count'},
        ],
      };

      const zodSchema = schemaToZod(schema);

      const validDoc = {
        title: 'Hello',
        count: 123,
      };
      expect(zodSchema.safeParse(validDoc).success).toBe(true);

      const invalidDoc = {
        title: 123,
        count: 'many',
      };
      const result = zodSchema.safeParse(invalidDoc);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBe(2);
      }
    });
  });
});
