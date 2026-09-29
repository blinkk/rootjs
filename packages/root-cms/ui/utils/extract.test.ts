import {describe, it, expect} from 'vitest';
import * as schema from '../../core/schema.js';
import {
  extractFields,
  extractFieldsWithMetadata,
  extractField,
  extractFieldWithMetadata,
  extractRichTextStrings,
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

    it('should skip fields marked with translate: false', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          translate: false,
        },
      };
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hello World')).toBe(true);
      expect(strings.has('This is a description')).toBe(false);
    });

    it('should skip fields marked with legacy disableTranslations', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          disableTranslations: true,
        },
      };
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hello World')).toBe(true);
      expect(strings.has('This is a description')).toBe(false);
    });

    it('should extract fields when translate metadata is not false', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
        {type: 'string', id: 'description', translate: true},
      ];
      const data = {
        title: 'Hello World',
        description: 'This is a description',
        '@description': {
          description: 'translator note',
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
          description: 'This should be formal',
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

    it('should skip fields marked with translate: false', () => {
      const fields: schema.Field[] = [
        {type: 'string', id: 'title', translate: true},
      ];
      const data = {
        title: 'Hello World',
        '@title': {
          translate: false,
          description: 'Some description',
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
            description: 'Important context',
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

    it('should skip image alt text when metadata alt is false', () => {
      const fields: schema.Field[] = [
        {type: 'image', id: 'hero', translate: true},
      ];
      const data = {
        hero: {src: 'image.jpg', alt: 'Hero image'},
        '@hero': {alt: false},
      };
      const strings = new Set<string>();

      extractFields(strings, fields, data);

      expect(strings.has('Hero image')).toBe(false);
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

  describe('extractRichTextStrings', () => {
    const richTextField: schema.RichTextField = {
      type: 'richtext',
      id: 'body',
      translate: true,
      blockComponents: [
        {
          name: 'CustomBlock',
          fields: [
            {type: 'string', id: 'title', translate: true},
            {type: 'string', id: 'url', translate: false},
            {type: 'string', id: 'note', translate: true},
          ],
        },
      ],
      inlineComponents: [
        {
          name: 'Tooltip',
          fields: [
            {type: 'string', id: 'label', translate: true},
            {type: 'string', id: 'href'},
          ],
        },
      ],
    };

    it('should extract strings from custom block components', () => {
      const data = {
        '@body': {},
        body: {
          blocks: [
            {type: 'paragraph', data: {text: 'Intro'}},
            {
              type: 'CustomBlock',
              data: {
                title: 'Block title',
                url: 'https://example.com',
                note: 'Hidden note',
                '@note': {translate: false},
              },
            },
          ],
          time: 0,
          version: '',
        },
      };
      const strings = new Set<string>();

      extractFields(strings, [richTextField], data);

      expect(Array.from(strings).sort()).toEqual(['Block title', 'Intro']);
    });

    it('should extract strings from inline components using their schema', () => {
      const data = {
        body: {
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: 'Hello {tooltip1}',
                components: {
                  tooltip1: {
                    type: 'Tooltip',
                    data: {label: 'Tooltip label', href: '/foo'},
                  },
                },
              },
            },
          ],
          time: 0,
          version: '',
        },
      };
      const strings = new Set<string>();

      extractFields(strings, [richTextField], data);

      expect(Array.from(strings).sort()).toEqual([
        'Hello {tooltip1}',
        'Tooltip label',
      ]);
    });

    it('should extract image alt text and captions', () => {
      const strings = new Set<string>();

      extractRichTextStrings(strings, {
        blocks: [
          {
            type: 'image',
            data: {
              file: {url: '/img.png', width: 1, height: 1, alt: 'Alt text'},
              caption: 'Caption text',
            },
          },
        ],
        time: 0,
        version: '',
      });

      expect(Array.from(strings).sort()).toEqual(['Alt text', 'Caption text']);
    });

    it('should extract custom block strings nested in tables', () => {
      const strings = new Set<string>();

      extractRichTextStrings(
        strings,
        {
          blocks: [
            {
              type: 'table',
              data: {
                rows: [
                  {
                    cells: [
                      {
                        type: 'data',
                        blocks: [
                          {type: 'CustomBlock', data: {title: 'Cell block'}},
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
          time: 0,
          version: '',
        },
        richTextField
      );

      expect(Array.from(strings)).toEqual(['Cell block']);
    });
  });
});
