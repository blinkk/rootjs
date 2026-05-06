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

  it('returns empty when the path cannot be resolved', () => {
    expect(
      validateValueAtPath(collection, 'unknown.deeply.nested', 'anything')
    ).toEqual([]);
  });
});
