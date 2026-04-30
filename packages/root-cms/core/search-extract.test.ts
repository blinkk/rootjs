import {describe, it, expect} from 'vitest';
import * as schema from './schema.js';
import {
  MAX_FIELD_TEXT_CHARS,
  extractDocRecords,
  extractRichText,
  stripHtml,
} from './search-extract.js';

describe('stripHtml', () => {
  it('removes tags and decodes entities', () => {
    expect(stripHtml('<p>Hello <b>world</b>&nbsp;&amp; friends</p>')).toBe(
      'Hello world & friends'
    );
  });

  it('strips script/style block contents', () => {
    expect(
      stripHtml('<p>Hi</p><script>alert(1)</script><style>x{}</style>')
    ).toBe('Hi');
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('extractRichText', () => {
  it('extracts paragraph and heading text', () => {
    const result = extractRichText({
      blocks: [
        {type: 'heading', data: {level: 2, text: 'Welcome'}},
        {type: 'paragraph', data: {text: 'Hello <b>world</b>'}},
      ],
    });
    expect(result).toBe('Welcome Hello world');
  });

  it('flattens nested list items', () => {
    const result = extractRichText({
      blocks: [
        {
          type: 'unorderedList',
          data: {
            items: [
              {content: 'one'},
              {
                content: 'two',
                items: [{content: 'two.a'}, {content: 'two.b'}],
              },
            ],
          },
        },
      ],
    });
    expect(result).toBe('one two two.a two.b');
  });

  it('walks table cells recursively', () => {
    const result = extractRichText({
      blocks: [
        {
          type: 'table',
          data: {
            rows: [
              {
                cells: [
                  {
                    type: 'header',
                    blocks: [{type: 'paragraph', data: {text: 'col'}}],
                  },
                  {
                    type: 'data',
                    blocks: [{type: 'paragraph', data: {text: 'val'}}],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(result).toBe('col val');
  });

  it('strips html block tags', () => {
    const result = extractRichText({
      blocks: [{type: 'html', data: {html: '<div>raw <em>html</em></div>'}}],
    });
    expect(result).toBe('raw html');
  });

  it('ignores unknown / non-textual blocks', () => {
    const result = extractRichText({
      blocks: [
        {type: 'delimiter', data: {}},
        {type: 'image', data: {file: {url: '/foo.png'}}},
        {type: 'paragraph', data: {text: 'kept'}},
      ],
    });
    expect(result).toBe('kept');
  });

  it('returns empty string for missing/invalid input', () => {
    expect(extractRichText(null)).toBe('');
    expect(extractRichText({})).toBe('');
    expect(extractRichText({blocks: 'not-an-array'} as any)).toBe('');
  });
});

describe('extractDocRecords', () => {
  it('emits records for top-level string and richtext fields', () => {
    const PageSchema = schema.define({
      name: 'Page',
      fields: [
        schema.string({id: 'title', label: 'Title'}),
        schema.richtext({id: 'body', label: 'Body'}),
      ],
    });

    const records = extractDocRecords(PageSchema, {
      collection: 'Pages',
      slug: 'home',
      fields: {
        title: 'Hello',
        body: {blocks: [{type: 'paragraph', data: {text: 'World'}}]},
      },
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: 'Pages/home#fields.title',
      docId: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      deepKey: 'fields.title',
      fieldType: 'string',
      fieldLabel: 'Title',
      text: 'Hello',
    });
    expect(records[1]).toMatchObject({
      deepKey: 'fields.body',
      fieldType: 'richtext',
      text: 'World',
    });
  });

  it('skips number, date, boolean, image, file, reference', () => {
    const Schema = schema.define({
      name: 'X',
      fields: [
        schema.number({id: 'n'}),
        schema.boolean({id: 'b'}),
        schema.date({id: 'd'}),
        schema.datetime({id: 'dt'}),
        schema.image({id: 'img'}),
        schema.file({id: 'f'}),
        schema.reference({id: 'ref'}),
        schema.references({id: 'refs'}),
        schema.string({id: 'kept'}),
      ],
    });
    const records = extractDocRecords(Schema, {
      collection: 'X',
      slug: 's',
      fields: {
        n: 7,
        b: true,
        d: '2024-01-01',
        dt: '2024-01-01T00:00:00Z',
        img: {src: '/a.png', alt: 'alt'},
        f: {src: '/x.pdf'},
        ref: {id: 'Other/foo'},
        refs: [{id: 'Other/foo'}],
        kept: 'keep me',
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.deepKey).toBe('fields.kept');
  });

  it('emits multiselect values joined', () => {
    const S = schema.define({
      name: 'M',
      fields: [
        schema.multiselect({
          id: 'tags',
          options: [{value: 'a'}, {value: 'b'}, {value: 'c'}],
        }),
      ],
    });
    const records = extractDocRecords(S, {
      collection: 'M',
      slug: 's',
      fields: {tags: ['a', 'c']},
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.text).toBe('a c');
  });

  it('recurses into nested object fields', () => {
    const S = schema.define({
      name: 'N',
      fields: [
        schema.object({
          id: 'meta',
          fields: [
            schema.string({id: 'title'}),
            schema.object({
              id: 'seo',
              fields: [schema.string({id: 'desc', label: 'Description'})],
            }),
          ],
        }),
      ],
    });
    const records = extractDocRecords(S, {
      collection: 'N',
      slug: 's',
      fields: {
        meta: {
          title: 'Outer',
          seo: {desc: 'Inner'},
        },
      },
    });
    expect(records.map((r) => r.deepKey).sort()).toEqual([
      'fields.meta.seo.desc',
      'fields.meta.title',
    ]);
    const seo = records.find((r) => r.deepKey === 'fields.meta.seo.desc');
    expect(seo?.fieldLabel).toBe('Description');
    expect(seo?.text).toBe('Inner');
  });

  it('walks array items in _array order with autokey deepKeys', () => {
    const S = schema.define({
      name: 'A',
      fields: [
        schema.array({
          id: 'list',
          of: schema.object({fields: [schema.string({id: 'title'})]}),
        }),
      ],
    });
    const records = extractDocRecords(S, {
      collection: 'A',
      slug: 's',
      fields: {
        list: {
          _array: ['k2', 'k1'],
          k1: {title: 'first'},
          k2: {title: 'second'},
          // Stale entry not in _array — must be ignored.
          orphan: {title: 'do-not-include'},
        },
      },
    });
    expect(records.map((r) => r.deepKey)).toEqual([
      'fields.list.k2.title',
      'fields.list.k1.title',
    ]);
    expect(records[0]?.text).toBe('second');
    expect(records[1]?.text).toBe('first');
  });

  it('returns no records for arrays without _array', () => {
    const S = schema.define({
      name: 'A',
      fields: [
        schema.array({
          id: 'list',
          of: schema.object({fields: [schema.string({id: 'title'})]}),
        }),
      ],
    });
    const records = extractDocRecords(S, {
      collection: 'A',
      slug: 's',
      fields: {list: {k1: {title: 'orphan'}}},
    });
    expect(records).toEqual([]);
  });

  it('resolves oneOf fields via _type discriminator', () => {
    const TextBlock = schema.define({
      name: 'TextBlock',
      fields: [schema.string({id: 'text'})],
    });
    const ImageBlock = schema.define({
      name: 'ImageBlock',
      fields: [schema.image({id: 'image'})],
    });
    const S = schema.define({
      name: 'O',
      fields: [
        schema.array({
          id: 'blocks',
          of: schema.oneOf({types: [TextBlock, ImageBlock]}),
        }),
      ],
    });
    const records = extractDocRecords(S, {
      collection: 'O',
      slug: 's',
      fields: {
        blocks: {
          _array: ['a', 'b'],
          a: {_type: 'TextBlock', text: 'hello'},
          b: {_type: 'ImageBlock', image: {src: '/a.png'}},
        },
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      deepKey: 'fields.blocks.a.text',
      text: 'hello',
    });
  });

  it('truncates long text to MAX_FIELD_TEXT_CHARS', () => {
    const S = schema.define({
      name: 'T',
      fields: [schema.string({id: 's'})],
    });
    const long = 'x'.repeat(MAX_FIELD_TEXT_CHARS + 500);
    const records = extractDocRecords(S, {
      collection: 'T',
      slug: 'one',
      fields: {s: long},
    });
    expect(records[0]?.text.length).toBe(MAX_FIELD_TEXT_CHARS);
  });

  it('ignores empty strings', () => {
    const S = schema.define({
      name: 'E',
      fields: [schema.string({id: 'a'}), schema.string({id: 'b'})],
    });
    const records = extractDocRecords(S, {
      collection: 'E',
      slug: 's',
      fields: {a: '   ', b: 'kept'},
    });
    expect(records.map((r) => r.deepKey)).toEqual(['fields.b']);
  });
});
