import {describe, it, expect} from 'vitest';
import * as schema from '../../../core/schema.js';
import {getDefaultFieldValue, normalizePresetData} from './fields.js';

describe('normalizePresetData', () => {
  it('converts plain arrays at array-field positions to array-maps', () => {
    const CardGrid = schema.define({
      name: 'CardGrid',
      fields: [
        schema.array({
          id: 'cards',
          of: schema.object({
            fields: [schema.string({id: 'title'})],
          }),
        }),
      ],
    });
    const result = normalizePresetData(CardGrid, {
      cards: [{title: 'A'}, {title: 'B'}],
    });
    expect(Array.isArray(result.cards)).toBe(false);
    expect(Array.isArray(result.cards._array)).toBe(true);
    expect(result.cards._array).toHaveLength(2);
    const [k1, k2] = result.cards._array;
    expect(result.cards[k1]).toEqual({title: 'A'});
    expect(result.cards[k2]).toEqual({title: 'B'});
  });

  it('leaves array-maps untouched if the author already wrote one', () => {
    const CardGrid = schema.define({
      name: 'CardGrid',
      fields: [
        schema.array({
          id: 'cards',
          of: schema.object({
            fields: [schema.string({id: 'title'})],
          }),
        }),
      ],
    });
    const arrayMap = {_array: ['x'], x: {title: 'A'}};
    const result = normalizePresetData(CardGrid, {cards: arrayMap});
    expect(result.cards).toEqual(arrayMap);
  });

  it('recurses into object fields and normalizes their nested arrays', () => {
    const Page = schema.define({
      name: 'Page',
      fields: [
        schema.object({
          id: 'meta',
          fields: [
            schema.array({
              id: 'tags',
              of: schema.object({fields: [schema.string({id: 'label'})]}),
            }),
          ],
        }),
      ],
    });
    const result = normalizePresetData(Page, {
      meta: {tags: [{label: 'a'}, {label: 'b'}]},
    });
    expect(Array.isArray(result.meta.tags._array)).toBe(true);
    expect(result.meta.tags._array).toHaveLength(2);
  });

  it('recurses into items of an array of objects', () => {
    const Doc = schema.define({
      name: 'Doc',
      fields: [
        schema.array({
          id: 'sections',
          of: schema.object({
            fields: [
              schema.array({
                id: 'paragraphs',
                of: schema.object({
                  fields: [schema.string({id: 'text'})],
                }),
              }),
            ],
          }),
        }),
      ],
    });
    const result = normalizePresetData(Doc, {
      sections: [
        {
          paragraphs: [{text: 'p1'}, {text: 'p2'}],
        },
      ],
    });
    const [sectionKey] = result.sections._array;
    const section = result.sections[sectionKey];
    expect(Array.isArray(section.paragraphs._array)).toBe(true);
    expect(section.paragraphs._array).toHaveLength(2);
  });

  it('handles oneof items in arrays via the types map', () => {
    const ImageBlock = schema.define({
      name: 'ImageBlock',
      fields: [
        schema.array({
          id: 'tags',
          of: schema.object({fields: [schema.string({id: 'label'})]}),
        }),
      ],
    });
    const types = {ImageBlock};
    const Container = schema.define({
      name: 'Container',
      fields: [
        schema.array({
          id: 'children',
          of: schema.oneOf({types: ['ImageBlock']}),
        }),
      ],
    });
    const result = normalizePresetData(
      Container,
      {
        children: [{_type: 'ImageBlock', tags: [{label: 'a'}]}],
      },
      types
    );
    const [childKey] = result.children._array;
    const child = result.children[childKey];
    expect(child._type).toBe('ImageBlock');
    expect(Array.isArray(child.tags._array)).toBe(true);
    expect(child.tags._array).toHaveLength(1);
  });
});

describe('getDefaultFieldValue', () => {
  it('uses field defaults when set', () => {
    const Hero = schema.define({
      name: 'Hero',
      fields: [
        schema.string({id: 'title', default: 'Default title'}),
        schema.string({id: 'subtitle'}),
      ],
    });
    expect(getDefaultFieldValue(Hero)).toEqual({title: 'Default title'});
  });
});
