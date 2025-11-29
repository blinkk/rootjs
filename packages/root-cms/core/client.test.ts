import {Timestamp} from 'firebase-admin/firestore';
import {describe, it, expect} from 'vitest';
import {marshalData, applySchemaConversions} from './client.js';
import {Schema} from './schema.js';

describe('client', () => {
  describe('marshalData', () => {
    it('preserves Timestamps', () => {
      const ts = Timestamp.now();
      const data = {
        time: ts,
        nested: {
          time: ts,
        },
      };
      const marshaled = marshalData(data);
      expect(marshaled.time).toBe(ts);
      expect(marshaled.nested.time).toBe(ts);
    });

    it('marshals arrays', () => {
      const data = {
        tags: ['a', 'b'],
        items: [{id: 1}, {id: 2}],
      };
      const marshaled = marshalData(data);
      expect(marshaled.tags).toEqual(['a', 'b']);
      expect(marshaled.items._array).toHaveLength(2);
      expect(marshaled.items[marshaled.items._array[0]].id).toBe(1);
    });
  });

  describe('applySchemaConversions', () => {
    it('converts datetime numbers to Timestamps', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {type: 'datetime', id: 'publishedAt'},
          {type: 'string', id: 'title'},
        ],
      };
      const data = {
        publishedAt: 1630000000000,
        title: 'Hello',
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.publishedAt).toBeInstanceOf(Timestamp);
      expect(converted.publishedAt.toMillis()).toBe(1630000000000);
      expect(converted.title).toBe('Hello');
    });

    it('handles nested objects', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'object',
            id: 'meta',
            fields: [{type: 'datetime', id: 'updatedAt'}],
          },
        ],
      };
      const data = {
        meta: {
          updatedAt: 1630000000000,
        },
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.meta.updatedAt).toBeInstanceOf(Timestamp);
      expect(converted.meta.updatedAt.toMillis()).toBe(1630000000000);
    });

    it('handles arrays of objects', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'array',
            id: 'items',
            of: {
              type: 'object',
              fields: [{type: 'datetime', id: 'date'}],
            },
          },
        ],
      };
      const data = {
        items: [{date: 1630000000000}, {date: 1630000001000}],
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.items[0].date).toBeInstanceOf(Timestamp);
      expect(converted.items[1].date).toBeInstanceOf(Timestamp);
    });
  });
});
