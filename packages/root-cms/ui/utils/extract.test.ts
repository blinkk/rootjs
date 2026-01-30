import {describe, it, expect} from 'vitest';
import * as schema from '../../core/schema.js';
import {
  extractFields,
  extractFieldsWithMetadata,
  extractField,
  extractFieldWithMetadata,
} from './extract.js';

describe('extract', () => {
  describe('extractFields', () => {
    it('should extract translatable string fields', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'slug', translate: false},
      ];
      const data = {title: 'Hello World', slug: 'hello-world'};
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hello World')).toBe(true);
      expect(strings.has('hello-world')).toBe(false);
    });

    it('should skip fields marked with doNotTranslate', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          translations: {
            doNotTranslate: true,
          },
        },
      };
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hello World')).toBe(true);
      expect(strings.has('This is a description')).toBe(false);
    });

    it('should extract fields without doNotTranslate metadata', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          translations: {
            doNotTranslate: false,
          },
        },
      };
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hello World')).toBe(true);
      expect(strings.has('This is a description')).toBe(true);
    });
  });

  describe('extractFieldsWithMetadata', () => {
    it('should extract strings with translator notes', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          translations: {
            description: 'This should be formal',
          },
        },
      };
      const stringsWithMeta = new Map<string, {description?: string}>();

      extractFieldsWithMetadata(stringsWithMeta, fields, data);

      expect(stringsWithMeta.get('Hello World')).toEqual({
        description: undefined,
      });
      expect(stringsWithMeta.get('This is a description')).toEqual({
        description: 'This should be formal',
      });
    });

    it('should skip fields marked with doNotTranslate', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
      ];
      const data = {
        title: 'Hello World',
        '@title': {
          translations: {
            doNotTranslate: true,
            description: 'Some description',
          },
        },
      };
      const stringsWithMeta = new Map<string, {description?: string}>();

      extractFieldsWithMetadata(stringsWithMeta, fields, data);

      expect(stringsWithMeta.size).toBe(0);
    });

    it('should extract nested object fields with metadata', () => {
      const fields: schema.Field[] = [
        {
          type: 'object',
          id: 'meta',
          fields: [{type: 'string', id: 'title', translate: true}],
        },
      ];
      const data = {
        meta: {
          title: 'Nested Title',
          '@title': {
            translations: {
              description: 'Important context',
            },
          },
        },
      };
      const stringsWithMeta = new Map<string, {description?: string}>();

      extractFieldsWithMetadata(stringsWithMeta, fields, data);

      expect(stringsWithMeta.get('Nested Title')).toEqual({
        description: 'Important context',
      });
    });
  });

  describe('extractField', () => {
    it('should extract image alt text when translate is true', () => {
      const field: schema.Field = {type: 'image', id: 'hero', translate: true};
      const value = {src: 'image.jpg', alt: 'Hero image'};
      const strings = new Set<string>();

      extractField(strings, field, value);

      expect(strings.has('Hero image')).toBe(true);
    });

    it('should extract multiselect values when translate is true', () => {
      const field: schema.Field = {
        type: 'multiselect',
        id: 'tags',
        translate: true,
      };
      const value = ['tag1', 'tag2', 'tag3'];
      const strings = new Set<string>();

      extractField(strings, field, value);

      expect(strings.has('tag1')).toBe(true);
      expect(strings.has('tag2')).toBe(true);
      expect(strings.has('tag3')).toBe(true);
    });
  });

  describe('extractFieldWithMetadata', () => {
    it('should propagate description to extracted strings', () => {
      const field: schema.Field = {
        type: 'string',
        id: 'title',
        translate: true,
      };
      const value = 'Hello World';
      const stringsWithMeta = new Map<string, {description?: string}>();

      extractFieldWithMetadata(
        stringsWithMeta,
        field,
        value,
        {},
        'Keep it short'
      );

      expect(stringsWithMeta.get('Hello World')).toEqual({
        description: 'Keep it short',
      });
    });

    it('should handle array fields with description', () => {
      const field: schema.Field = {
        type: 'array',
        id: 'items',
        of: {type: 'string', translate: true},
      };
      const value = {_array: ['id1', 'id2'], id1: 'Item 1', id2: 'Item 2'};
      const stringsWithMeta = new Map<string, {description?: string}>();

      extractFieldWithMetadata(
        stringsWithMeta,
        field,
        value,
        {},
        'Array items context'
      );

      expect(stringsWithMeta.get('Item 1')).toEqual({
        description: 'Array items context',
      });
      expect(stringsWithMeta.get('Item 2')).toEqual({
        description: 'Array items context',
      });
    });
  });
});
