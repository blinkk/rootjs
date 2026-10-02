import {describe, expect, it} from 'vitest';
import * as schema from '../../core/schema.js';
import {diffDocFields, richTextToPlainText} from './doc-changes.js';

const Hero = schema.define({
  name: 'Hero',
  label: 'Hero',
  fields: [schema.string({id: 'headline', label: 'Headline'})],
});

const Cards = schema.define({
  name: 'Cards',
  label: 'Card grid',
  preview: {title: 'Cards: {title}'},
  fields: [schema.string({id: 'title', label: 'Title'})],
});

const collection: schema.Collection = {
  id: 'Pages',
  name: 'Pages',
  fields: [
    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({id: 'title', label: 'Page title'}),
        schema.image({id: 'image', label: 'Share image'}),
        schema.boolean({id: 'noindex', label: 'No index'}),
      ],
    }),
    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({types: [Hero, Cards]}),
    }),
    schema.richtext({id: 'body', label: 'Body'}),
    schema.references({id: 'related', label: 'Related pages'}),
  ],
};

function richtext(...texts: string[]) {
  return {
    time: Date.now(),
    version: '1',
    blocks: texts.map((text) => ({type: 'paragraph', data: {text}})),
  };
}

describe('diffDocFields', () => {
  it('returns no changes for identical fields', () => {
    const fields = {meta: {title: 'Home'}};
    expect(diffDocFields(collection, fields, structuredClone(fields))).toEqual(
      []
    );
  });

  it('labels nested changes using the schema', () => {
    const changes = diffDocFields(
      collection,
      {meta: {title: 'Home'}},
      {meta: {title: 'Welcome home'}}
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'modified',
      deepKey: 'fields.meta.title',
      path: ['Meta', 'Page title'],
      before: 'Home',
      after: 'Welcome home',
    });
  });

  it('reports a boolean being turned on or off as a change', () => {
    const changes = diffDocFields(
      collection,
      {meta: {noindex: false}},
      {meta: {noindex: true}}
    );
    expect(changes).toMatchObject([
      {type: 'modified', path: ['Meta', 'No index'], after: true},
    ]);
  });

  it('treats empty values as unset', () => {
    const changes = diffDocFields(
      collection,
      {meta: {title: '', noindex: false, image: {src: ''}}},
      {meta: {}}
    );
    expect(changes).toEqual([]);
  });

  it('reports added and removed values', () => {
    const changes = diffDocFields(
      collection,
      {meta: {title: 'Home'}},
      {meta: {image: {src: 'https://example.com/a.png', alt: 'A'}}}
    );
    expect(changes.map((c) => [c.type, c.path.join(' › ')])).toEqual([
      ['removed', 'Meta › Page title'],
      ['added', 'Meta › Share image'],
    ]);
  });

  it('diffs array items by key', () => {
    const before = {
      modules: {
        _array: ['a', 'b'],
        a: {_type: 'Hero', headline: 'Hi'},
        b: {_type: 'Cards', title: 'Old cards'},
      },
    };
    const after = {
      modules: {
        _array: ['a', 'c'],
        a: {_type: 'Hero', headline: 'Hello'},
        c: {_type: 'Cards', title: 'New cards'},
      },
    };
    const changes = diffDocFields(collection, before, after);
    expect(changes.map((c) => [c.type, c.path.join(' › ')])).toEqual([
      ['modified', 'Modules › #1 · Hero: Hello › Headline'],
      ['added', 'Modules › #2 · Cards: New cards'],
      ['removed', 'Modules › #2 · Cards: Old cards'],
    ]);
    expect(changes[1].children).toMatchObject([
      {type: 'added', path: ['Title'], after: 'New cards'},
    ]);
  });

  it('reports reordered array items', () => {
    const items = {
      a: {_type: 'Hero', headline: 'Hi'},
      b: {_type: 'Cards', title: 'Cards'},
    };
    const changes = diffDocFields(
      collection,
      {modules: {_array: ['a', 'b'], ...items}},
      {modules: {_array: ['b', 'a'], ...items}}
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'reordered',
      path: ['Modules'],
      before: ['Hero: Hi', 'Cards: Cards'],
      after: ['Cards: Cards', 'Hero: Hi'],
    });
  });

  it('reports a one-of type change as a single change', () => {
    const changes = diffDocFields(
      collection,
      {modules: {_array: ['a'], a: {_type: 'Hero', headline: 'Hi'}}},
      {modules: {_array: ['a'], a: {_type: 'Cards', title: 'Cards'}}}
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'modified',
      before: 'Hero',
      after: 'Card grid',
    });
    expect(changes[0].children?.map((c) => [c.type, c.path])).toEqual([
      ['removed', ['Headline']],
      ['added', ['Title']],
    ]);
  });

  it('ignores rich text editor bookkeeping', () => {
    const before = richtext('Hello world');
    const after = {...richtext('Hello world'), time: 1, version: '2'};
    expect(diffDocFields(collection, {body: before}, {body: after})).toEqual(
      []
    );
    const changed = diffDocFields(
      collection,
      {body: before},
      {body: richtext('Hello there')}
    );
    expect(changed).toHaveLength(1);
    expect(changed[0].type).toBe('modified');
  });

  it('compares references by id', () => {
    const changes = diffDocFields(
      collection,
      {related: [{id: 'Pages/a', collection: 'Pages', slug: 'a'}]},
      {related: [{id: 'Pages/a'}, {id: 'Pages/b'}]}
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toEqual(['Related pages']);
  });

  it('compares values that are not in the schema', () => {
    const changes = diffDocFields(
      collection,
      {legacy: 'old', '@meta': {translate: false}},
      {legacy: 'new'}
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'modified',
      path: ['legacy'],
      before: 'old',
      after: 'new',
    });
  });

  it('works without a schema', () => {
    const changes = diffDocFields(
      null,
      {hero: {title: 'Hi', items: {_array: ['x'], x: {label: 'A'}}}},
      {hero: {title: 'Hi', items: {_array: ['x'], x: {label: 'B'}}}}
    );
    expect(changes.map((c) => c.path.join(' › '))).toEqual([
      'hero › items › #1 › label',
    ]);
  });
});

describe('richTextToPlainText', () => {
  it('converts blocks to plain text', () => {
    const text = richTextToPlainText({
      time: 0,
      version: '1',
      blocks: [
        {type: 'heading', data: {level: 2, text: 'Title'}},
        {type: 'paragraph', data: {text: 'Some <b>bold</b>&nbsp;text.'}},
        {
          type: 'unorderedList',
          data: {items: [{content: 'One'}, {content: 'Two'}]},
        },
        {type: 'Callout', data: {}},
      ],
    });
    expect(text).toBe('Title\n\nSome bold text.\n\n• One\n• Two\n\n[Callout]');
  });
});
