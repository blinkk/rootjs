import {describe, expect, it} from 'vitest';
import * as schema from '../../core/schema.js';
import {formatFieldPath, resolveFieldPath} from './field-labels.js';

const CARD = schema.define({
  name: 'Card',
  fields: [schema.string({id: 'title', label: 'Card Title'})],
});

const COLLECTION = {
  name: 'Pages',
  fields: [
    schema.string({id: 'title', label: 'Title'}),
    schema.object({
      id: 'hero',
      label: 'Hero',
      fields: [schema.string({id: 'headline', label: 'Headline'})],
    }),
    schema.array({
      id: 'sections',
      label: 'Sections',
      of: schema.oneOf({types: ['Card']}),
    }),
  ],
  types: {Card: CARD},
} as unknown as schema.Collection;

describe('resolveFieldPath', () => {
  it('labels top-level and nested object fields', () => {
    expect(formatFieldPath(COLLECTION, 'fields.title')).toBe('Title');
    expect(formatFieldPath(COLLECTION, 'fields.hero.headline')).toBe(
      'Hero › Headline'
    );
  });

  it('labels array items by position and resolves one-of types', () => {
    const values: Record<string, any> = {
      'fields.sections': {_array: ['aaa', 'bbb']},
      'fields.sections.bbb': {_type: 'Card'},
    };
    const getValue = (key: string) => values[key];
    const result = resolveFieldPath(
      COLLECTION,
      'fields.sections.bbb.title',
      getValue
    );
    expect(result.segments.map((s) => s.label)).toEqual([
      'Sections',
      '#2',
      'Card Title',
    ]);
    expect(result.field?.type).toBe('string');
  });

  it('falls back to raw keys when the schema does not match', () => {
    expect(formatFieldPath(COLLECTION, 'fields.missing.deep')).toBe(
      'missing › deep'
    );
    expect(formatFieldPath(null, 'fields.title')).toBe('title');
  });
});
