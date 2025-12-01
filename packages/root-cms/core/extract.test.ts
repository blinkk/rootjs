import {describe, expect, test} from 'vitest';
import {extractFields} from './extract.js';
import * as schema from './schema.js';

describe('extractFields', () => {
  test('extracts strings from string fields', () => {
    const fields: schema.Field[] = [
      schema.string({id: 'title', translate: true}),
      schema.string({id: 'desc', translate: false}),
    ];
    const data = {
      title: 'Hello World',
      desc: 'Ignored',
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Hello World')).toBe(true);
    expect(strings.has('Ignored')).toBe(false);
  });

  test('extracts strings from nested objects', () => {
    const fields: schema.Field[] = [
      schema.object({
        id: 'meta',
        fields: [schema.string({id: 'title', translate: true})],
      }),
    ];
    const data = {
      meta: {
        title: 'Nested Title',
      },
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Nested Title')).toBe(true);
  });

  test('extracts strings from arrays', () => {
    const fields: schema.Field[] = [
      schema.array({
        id: 'tags',
        of: schema.string({translate: true}),
      }),
    ];
    const data = {
      tags: ['Tag 1', 'Tag 2'],
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Tag 1')).toBe(true);
    expect(strings.has('Tag 2')).toBe(true);
  });

  test('extracts strings from normalized arrays', () => {
    const fields: schema.Field[] = [
      schema.array({
        id: 'items',
        of: schema.object({
          fields: [schema.string({id: 'text', translate: true})],
        }),
      }),
    ];
    const data = {
      items: {
        _array: ['k1', 'k2'],
        k1: {text: 'Item 1'},
        k2: {text: 'Item 2'},
      },
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Item 1')).toBe(true);
    expect(strings.has('Item 2')).toBe(true);
  });

  test('extracts strings from richtext', () => {
    const fields: schema.Field[] = [
      schema.richtext({id: 'content', translate: true}),
    ];
    const data = {
      content: {
        blocks: [
          {type: 'paragraph', data: {text: 'Paragraph text'}},
          {type: 'heading', data: {text: 'Heading text'}},
        ],
      },
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Paragraph text')).toBe(true);
    expect(strings.has('Heading text')).toBe(true);
  });

  test('handles richtext with invalid blocks gracefully', () => {
    const fields: schema.Field[] = [
      schema.richtext({id: 'content', translate: true}),
    ];
    const data = {
      content: {
        blocks: {some: 'object'} as any, // Invalid blocks
      },
    };
    const strings = new Set<string>();
    expect(() => extractFields(strings, fields, data)).not.toThrow();
  });

  test('filters blocked strings', () => {
    const fields: schema.Field[] = [
      schema.string({id: 'text', translate: true}),
    ];
    const data = {
      text: '<br>',
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.size).toBe(0);
  });

  test('extracts alt text from images and files', () => {
    const fields: schema.Field[] = [
      schema.image({id: 'hero', translate: true}),
      schema.file({id: 'doc', translate: true}),
    ];
    const data = {
      hero: {src: 'img.jpg', alt: 'Hero Image'},
      doc: {src: 'doc.pdf', alt: 'Document PDF'},
    };
    const strings = new Set<string>();
    extractFields(strings, fields, data);
    expect(strings.has('Hero Image')).toBe(true);
    expect(strings.has('Document PDF')).toBe(true);
  });

  test('extracts strings from oneof fields', () => {
    const fooSchema = schema.define({
      name: 'foo',
      fields: [schema.string({id: 'fooText', translate: true})],
    });
    const barSchema = schema.define({
      name: 'bar',
      fields: [schema.string({id: 'barText', translate: true})],
    });

    const fields: schema.Field[] = [
      schema.oneOf({
        id: 'section',
        types: [fooSchema, barSchema],
      }),
    ];

    const data1 = {
      section: {_type: 'foo', fooText: 'Foo Content'},
    };
    const strings1 = new Set<string>();
    extractFields(strings1, fields, data1, {
      foo: fooSchema,
      bar: barSchema,
    });
    expect(strings1.has('Foo Content')).toBe(true);

    const data2 = {
      section: {_type: 'bar', barText: 'Bar Content'},
    };
    const strings2 = new Set<string>();
    extractFields(strings2, fields, data2, {
      foo: fooSchema,
      bar: barSchema,
    });
    expect(strings2.has('Bar Content')).toBe(true);
  });
});
