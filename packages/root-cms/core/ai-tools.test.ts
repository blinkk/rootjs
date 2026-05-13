import {describe, expect, it} from 'vitest';
import {validateValueAtPath} from './ai-tools.js';
import {Collection} from './schema.js';

describe('validateValueAtPath', () => {
  const collection: Collection = {
    name: 'BlogPosts',
    fields: [
      {id: 'title', type: 'string'} as any,
      {
        id: 'content',
        type: 'object',
        fields: [
          {id: 'subtitle', type: 'string'},
          {id: 'body', type: 'richtext'},
          {
            id: 'modules',
            type: 'array',
            of: {
              type: 'object',
              fields: [{id: 'foo', type: 'string'}],
            },
          },
        ],
      } as any,
      {
        id: 'sections',
        type: 'array',
        of: {
          type: 'object',
          fields: [
            {id: 'heading', type: 'string'},
            {id: 'image', type: 'image'},
          ],
        },
      } as any,
    ],
  };

  it('passes a valid string', () => {
    expect(validateValueAtPath(collection, 'title', 'Hello')).toEqual([]);
  });

  it('rejects a string for a richtext field', () => {
    const errors = validateValueAtPath(
      collection,
      'content.body',
      '<b>some text</b>'
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({
      path: 'content.body',
      expected: 'object',
      received: 'string',
    });
  });

  it('accepts a properly shaped richtext value', () => {
    const value = {version: 'lexical-0.31.2', blocks: []};
    expect(validateValueAtPath(collection, 'content.body', value)).toEqual([]);
  });

  it('rejects a richtext value missing `blocks`', () => {
    const errors = validateValueAtPath(collection, 'content.body', {
      version: 'lexical-0.31.2',
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'content.body.blocks',
        expected: 'array',
      })
    );
  });

  it('walks into array items by numeric index', () => {
    const errors = validateValueAtPath(collection, 'sections.0.heading', 42);
    expect(errors[0]).toMatchObject({
      path: 'sections.0.heading',
      expected: 'string',
      received: 'number',
    });
  });

  it('rejects an image field with a string value', () => {
    const errors = validateValueAtPath(
      collection,
      'sections.0.image',
      '/image.png'
    );
    expect(errors[0]).toMatchObject({expected: 'object', received: 'string'});
  });

  it('accepts a valid whole array item update', () => {
    expect(
      validateValueAtPath(collection, 'sections.0', {
        heading: 'Hero',
        image: {src: '/hero.png'},
      })
    ).toEqual([]);
  });

  it('rejects an array item with the wrong shape', () => {
    const errors = validateValueAtPath(collection, 'sections.0', 'not object');
    expect(errors[0]).toMatchObject({
      path: 'sections.0',
      expected: 'object',
      received: 'string',
    });
  });

  it('rejects nested array fields without a numeric index', () => {
    const errors = validateValueAtPath(collection, 'sections.heading', 'Hero');
    expect(errors[0]).toMatchObject({
      path: 'sections.heading',
      expected: 'array index',
      received: 'heading',
    });
  });

  it('rejects numeric path segments outside array fields', () => {
    const errors = validateValueAtPath(
      collection,
      'content.0.subtitle',
      'Hero'
    );
    expect(errors[0]).toMatchObject({
      path: 'content.0',
      expected: 'array field',
      received: 'object',
    });
  });

  it('rejects array indices with leading zeroes', () => {
    const errors = validateValueAtPath(
      collection,
      'sections.01.heading',
      'Hero'
    );
    expect(errors[0]).toMatchObject({
      path: 'sections.01',
      expected: 'array index',
      received: '01',
    });
  });

  it('rejects bracket notation for array items', () => {
    const errors = validateValueAtPath(
      collection,
      'sections[0].heading',
      'Hero'
    );
    expect(errors[0]).toMatchObject({
      path: 'sections[0].heading',
      expected: 'dotted array index path',
    });
  });

  it('rejects field-prefixed paths before array items', () => {
    const errors = validateValueAtPath(
      collection,
      'fields.content.modules.1.foo',
      'Hero'
    );
    expect(errors[0]).toMatchObject({
      path: 'fields.content.modules.1.foo',
      expected: 'field path without fields prefix',
    });
  });

  it('validates nested object array items by zero-based index', () => {
    const errors = validateValueAtPath(collection, 'content.modules.0.foo', 42);
    expect(errors[0]).toMatchObject({
      path: 'content.modules.0.foo',
      expected: 'string',
      received: 'number',
    });
  });

  it('returns empty when the path cannot be resolved', () => {
    expect(
      validateValueAtPath(collection, 'unknown.deeply.nested', 'anything')
    ).toEqual([]);
  });
});
