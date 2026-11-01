import {describe, expect, it} from 'vitest';
import {
  marshalFieldsForStorage,
  marshalValueForStorage,
  normalizeFields,
  prepareFieldsForWrite,
  prepareValueForWrite,
} from './doc-normalize.js';
import * as schema from './schema.js';

const Hero = schema.define({
  name: 'Hero',
  fields: [
    schema.string({id: 'title'}),
    schema.richtext({id: 'body'}),
    schema.number({id: 'count'}),
  ],
});

const collection = {
  name: 'Pages',
  fields: [
    schema.string({id: 'title'}),
    schema.number({id: 'count'}),
    schema.boolean({id: 'enabled'}),
    schema.date({id: 'day'}),
    schema.datetime({id: 'launch'}),
    schema.multiselect({id: 'tags', options: ['a', 'b']}),
    schema.image({id: 'image'}),
    schema.reference({id: 'ref'}),
    schema.references({id: 'refs'}),
    schema.richtext({id: 'body'}),
    schema.object({id: 'meta', fields: [schema.string({id: 'name'})]}),
    schema.array({
      id: 'modules',
      of: schema.oneOf({types: ['Hero'] as any}),
    }),
  ],
  types: {Hero},
} as unknown as schema.Schema;

function normalize(fields: Record<string, any>) {
  return normalizeFields(fields, collection).fields;
}

function normalizeBlock(block: any) {
  return normalize({body: {blocks: [block]}}).body.blocks[0];
}

describe('normalizeFields', () => {
  it('leaves valid data alone, without repairs', () => {
    const fields = {
      title: 'Hello',
      count: 1,
      modules: [{_type: 'Hero', title: 'Hi', _arrayKey: 'abc'}],
    };
    const result = normalizeFields(fields, collection);
    expect(result.fields).toEqual(fields);
    expect(result.repairs).toEqual([]);
  });

  it('does not mutate the input', () => {
    const fields = {count: '1', body: {blocks: [{type: 'header', data: {}}]}};
    const copy = structuredClone(fields);
    normalize(fields);
    expect(fields).toEqual(copy);
  });

  it('coerces scalars, reporting a repair for each', () => {
    const result = normalizeFields(
      {title: 2026, count: '42', enabled: 'false'},
      collection
    );
    expect(result.fields).toEqual({title: '2026', count: 42, enabled: false});
    expect(result.repairs.map((repair) => repair.path)).toEqual([
      'title',
      'count',
      'enabled',
    ]);
  });

  it('keeps text that looks like JSON in string fields', () => {
    expect(normalize({title: '{"a": 1}'}).title).toBe('{"a": 1}');
  });

  it('parses stringified JSON for structured fields', () => {
    expect(normalize({meta: '{"name": "x"}'}).meta).toEqual({name: 'x'});
    expect(normalize({modules: '[{"_type": "Hero"}]'}).modules).toEqual([
      {_type: 'Hero'},
    ]);
  });

  it('unwraps `_array` notation', () => {
    const wrapped = {_array: ['k'], k: 'a'};
    expect(normalize({tags: wrapped}).tags).toEqual(['a']);
    expect(
      normalize({modules: {_array: ['k'], k: {_type: 'Hero', title: 'x'}}})
        .modules
    ).toEqual([{_type: 'Hero', title: 'x', _arrayKey: 'k'}]);
  });

  it('rebuilds array fields from invalid maps, end to end', () => {
    const toStored = (modules: any) =>
      marshalFieldsForStorage(normalize({modules}), collection).modules;
    const hero = (title: string) => ({_type: 'Hero', title});

    // Numeric keys, with and without `_array`.
    for (const modules of [
      {0: hero('a'), 1: hero('b')},
      {_array: ['0', '1'], 0: hero('a'), 1: hero('b')},
      {_array: [0, 1], 0: hero('a'), 1: hero('b')},
    ]) {
      const stored = toStored(modules);
      expect(stored._array).toHaveLength(2);
      for (const key of stored._array) {
        expect(key).not.toMatch(/^\d+$/);
      }
      expect(stored._array.map((key: string) => stored[key].title)).toEqual([
        'a',
        'b',
      ]);
    }

    // A map of items with no `_array` keeps its keys.
    const stored = toStored({abc: hero('a'), 'older-key': hero('b')});
    expect(stored._array).toEqual(['abc', 'older-key']);

    // A numeric key holding a write to `modules.0.title`.
    const merged = toStored({
      _array: ['abc'],
      abc: hero('old'),
      0: {title: 'new'},
    });
    expect(merged).toEqual({_array: ['abc'], abc: hero('new')});
  });

  it('reports rebuilt arrays', () => {
    const {repairs} = normalizeFields(
      {modules: {0: {_type: 'Hero'}}},
      collection
    );
    expect(repairs).toMatchObject([{path: 'modules'}]);
    // A valid map doesn't need a repair.
    expect(
      normalizeFields(
        {modules: {_array: ['abc'], abc: {_type: 'Hero'}}},
        collection
      ).repairs
    ).toEqual([]);
  });

  it('does not treat a single item as a map of items', () => {
    const value = {_type: 'Hero', title: 'x'};
    expect(normalize({modules: value}).modules).toEqual(value);
    expect(
      prepareFieldsForWrite({modules: value}, {schema: collection}).errors
    ).toHaveLength(1);
  });

  it('converts shorthand values to their object shape', () => {
    expect(normalize({image: '/a.png'}).image).toEqual({src: '/a.png'});
    expect(normalize({tags: 'a'}).tags).toEqual(['a']);
    expect(normalize({ref: 'Pages/foo/bar'}).ref).toEqual({
      id: 'Pages/foo--bar',
      collection: 'Pages',
      slug: 'foo--bar',
    });
  });

  it('normalizes dates', () => {
    expect(normalize({day: '2026-03-04T10:00:00Z'}).day).toBe('2026-03-04');
    expect(normalize({day: '2026-03-04'}).day).toBe('2026-03-04');
  });

  it('normalizes every datetime shape to a timestamp', () => {
    const millis = 1700000000000;
    const expected = {seconds: 1700000000, nanoseconds: 0};
    for (const value of [
      millis,
      new Date(millis).toISOString(),
      {seconds: 1700000000, nanoseconds: 0},
      {_seconds: 1700000000, _nanoseconds: 0},
      {type: 'firestore/timestamp/1.0', seconds: 1700000000, nanoseconds: 0},
      // Epoch seconds, and numbers as strings.
      1700000000,
      '1700000000000',
      new Date(millis),
      {toMillis: () => millis},
    ]) {
      expect(normalize({launch: value}).launch).toEqual(expected);
    }
    const result = normalizeFields({launch: millis}, collection, {
      toTimestamp: (ms) => `timestamp:${ms}`,
    });
    expect(result.fields.launch).toBe(`timestamp:${millis}`);
  });

  it('accepts a timestamp for date and number fields', () => {
    const value = {seconds: 1700000000, nanoseconds: 0};
    expect(normalize({day: value}).day).toBe('2023-11-14');
    expect(normalize({day: new Date(1700000000000)}).day).toBe('2023-11-14');
    expect(normalize({count: value}).count).toBe(1700000000000);
  });

  it('keeps datetimes from before 1970 and in early 1970', () => {
    expect(normalize({launch: -1000}).launch).toEqual({
      seconds: -1,
      nanoseconds: 0,
    });
    expect(normalize({launch: 5000}).launch).toEqual({
      seconds: 5,
      nanoseconds: 0,
    });
  });

  it('normalizes values inside of oneOf types and localized values', () => {
    const fields = normalize({
      modules: [{_type: 'Hero', count: '5'}],
      '@count': {localizedValues: {de: '7', '@de': {hidden: true}}},
    });
    expect(fields.modules[0].count).toBe(5);
    expect(fields['@count'].localizedValues.de).toBe(7);
  });
});

describe('normalizeFields rich text', () => {
  it('adds the keys required for rich text to be stored as-is', () => {
    const body = normalize({body: {blocks: []}}).body;
    expect(body.time).toEqual(expect.any(Number));
    expect(body.version).toEqual(expect.any(String));
  });

  it('converts text to paragraphs', () => {
    expect(normalize({body: 'One\n\nTwo'}).body.blocks).toEqual([
      {type: 'paragraph', data: {text: 'One'}},
      {type: 'paragraph', data: {text: 'Two'}},
    ]);
  });

  it('unwraps `_array` blocks', () => {
    const blocks = {
      _array: ['k'],
      k: {type: 'paragraph', data: {text: 'x'}},
    };
    expect(normalize({body: {blocks}}).body.blocks[0].data).toEqual({
      text: 'x',
    });
  });

  it('converts Editor.js blocks', () => {
    expect(
      normalizeBlock({type: 'header', data: {text: 'x', level: '9'}})
    ).toEqual({type: 'heading', data: {text: 'x', level: 6}});
    expect(
      normalizeBlock({
        type: 'list',
        data: {style: 'ordered', items: ['a', {text: 'b'}]},
      })
    ).toEqual({
      type: 'orderedList',
      data: {
        style: 'ordered',
        items: [{content: 'a', items: []}, {content: 'b'}],
      },
    });
    expect(
      normalizeBlock({
        type: 'table',
        data: {withHeadings: true, content: [['h'], ['d']]},
      }).data.rows
    ).toEqual([
      {
        cells: [
          {type: 'header', blocks: [{type: 'paragraph', data: {text: 'h'}}]},
        ],
      },
      {
        cells: [
          {type: 'data', blocks: [{type: 'paragraph', data: {text: 'd'}}]},
        ],
      },
    ]);
    expect(normalizeBlock({type: 'image', data: {url: '/a.png'}})).toEqual({
      type: 'image',
      data: {file: {url: '/a.png'}},
    });
  });

  it('moves values into `data`', () => {
    expect(normalizeBlock({type: 'paragraph', text: 'x'})).toEqual({
      type: 'paragraph',
      data: {text: 'x'},
    });
    expect(normalizeBlock('x')).toEqual({type: 'paragraph', data: {text: 'x'}});
  });
});

describe('prepareFieldsForWrite', () => {
  it('validates the normalized value', () => {
    const result = prepareFieldsForWrite({count: '42'}, {schema: collection});
    expect(result.errors).toEqual([]);
    expect(result.fields.count).toBe(42);
    expect(result.repairs).toHaveLength(1);
  });

  it('reports what can not be repaired', () => {
    const result = prepareFieldsForWrite(
      {count: 'many', titel: 'x', modules: [{_type: 'Hero', title: {a: 1}}]},
      {schema: collection}
    );
    expect(result.errors.map((error) => error.path).sort()).toEqual([
      'count',
      'modules.0.title',
      'titel',
    ]);
  });

  it('only reports errors the change introduced', () => {
    const before = {legacy: 'x', count: 'many', title: 'a'};
    expect(
      prepareFieldsForWrite(
        {...before, title: 'b'},
        {schema: collection, before}
      ).errors
    ).toEqual([]);
    expect(
      prepareFieldsForWrite(
        {...before, title: {a: 1}},
        {schema: collection, before}
      ).errors
    ).toMatchObject([{path: 'title'}]);
  });

  it('tracks existing errors in array items that move', () => {
    const bad = {_type: 'Hero', count: 'many'};
    const before = {modules: [bad]};
    expect(
      prepareFieldsForWrite(
        {modules: [{_type: 'Hero', title: 'new'}, bad]},
        {schema: collection, before}
      ).errors
    ).toEqual([]);
    // A second item with the same problem is a new error.
    expect(
      prepareFieldsForWrite({modules: [bad, bad]}, {schema: collection, before})
        .errors
    ).toHaveLength(1);
  });
});

describe('prepareValueForWrite', () => {
  const field = schema.oneOf({types: ['Hero'] as any});

  it('checks a single value against a field', () => {
    const types = {Hero};
    expect(
      prepareValueForWrite({_type: 'Hero', count: '1'}, field, {types}).errors
    ).toEqual([]);
    expect(
      prepareValueForWrite({_type: 'Hero', title: {a: 1}}, field, {types})
        .errors
    ).toMatchObject([{path: 'title'}]);
    expect(prepareValueForWrite([{}], field, {types}).errors).toHaveLength(1);
  });
});

describe('marshalFieldsForStorage', () => {
  it('only converts array fields to the `_array` notation', () => {
    const body = {version: '1', time: 1, blocks: [{type: 'paragraph'}]};
    const refs = [{id: 'Pages/a', collection: 'Pages', slug: 'a'}];
    const stored = marshalFieldsForStorage(
      {
        tags: ['a'],
        refs,
        body,
        modules: [{_type: 'Hero', _arrayKey: 'abc', title: 'x', body}],
      },
      collection
    );
    expect(stored.tags).toEqual(['a']);
    expect(stored.refs).toEqual(refs);
    expect(stored.body).toEqual(body);
    expect(stored.modules).toEqual({
      _array: ['abc'],
      abc: {_type: 'Hero', title: 'x', body},
    });
  });

  it('marshals localized values against their field', () => {
    const stored = marshalFieldsForStorage(
      {'@tags': {localizedValues: {de: ['a']}}},
      collection
    );
    expect(stored['@tags'].localizedValues.de).toEqual(['a']);
  });

  it('keeps timestamps', () => {
    class FakeTimestamp {
      seconds = 1;
    }
    const value = new FakeTimestamp();
    const stored = marshalValueForStorage(
      value,
      schema.datetime({id: 'launch'}),
      undefined,
      {isTimestamp: (v) => v instanceof FakeTimestamp}
    );
    expect(stored).toBe(value);
  });
});
