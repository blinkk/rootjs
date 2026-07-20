import {describe, expect, it} from 'vitest';
import {
  applyDocEdits,
  computeReleaseDocIds,
  createCmsTools,
  createReadOnlyCmsTools,
  getReleaseStatus,
  validateValueAtPath,
  type CmsToolReadBackend,
} from './ai-tools.js';
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
      {
        id: 'tags',
        type: 'multiselect',
        options: ['a', 'b', 'c'],
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

  it('rejects lexical data with `_array` object notation for blocks', () => {
    // Rich text data (Lexical/EditorJS) is stored as-is in Firestore — `blocks`
    // must be a plain JSON array, not the `_array` object notation used for
    // marshaled CMS arrays. doc_updateField round-trips the value through
    // `marshalData()`, which silently corrupts data shaped like this.
    const errors = validateValueAtPath(collection, 'content.body', {
      version: 'lexical-0.31.2',
      time: 1763675872000,
      blocks: {
        _array: ['abc'],
        abc: {type: 'paragraph', data: {text: 'Hello'}},
      },
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'content.body.blocks',
        expected: 'array',
        received: 'object',
      })
    );
  });

  it('rejects multiselect data with `_array` object notation', () => {
    // Multiselect values are stored as a plain JSON array of strings, not the
    // `_array` object notation used for marshaled CMS arrays. doc_updateField
    // round-trips the value through `marshalData()`, which silently corrupts
    // data shaped like this.
    const errors = validateValueAtPath(collection, 'tags', {
      _array: ['k1', 'k2'],
      k1: 'a',
      k2: 'b',
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'tags',
        expected: 'array',
        received: 'object',
      })
    );
  });

  it('accepts a multiselect value as a plain string array', () => {
    expect(validateValueAtPath(collection, 'tags', ['a', 'b'])).toEqual([]);
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

describe('applyDocEdits', () => {
  function baseFields() {
    return {
      hero: {title: 'Old title', subtitle: 'Sub'},
      content: {
        modules: [
          {_type: 'text', body: 'first'},
          {_type: 'text', body: 'second'},
        ],
      },
      tags: ['a', 'b'],
    };
  }

  it('sets a nested field value', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'hero.title', value: 'New title'},
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.hero.title).toBe('New title');
      expect(result.fields.hero.subtitle).toBe('Sub');
    }
  });

  it('sets a value inside an array item by index', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'content.modules.0.body', value: 'updated'},
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules[0].body).toBe('updated');
    }
  });

  it('creates a new object key with set', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'hero.cta', value: {label: 'Go'}},
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.hero.cta).toEqual({label: 'Go'});
    }
  });

  it('appends an array item when no index is given', () => {
    const result = applyDocEdits(baseFields(), [
      {
        op: 'insert_item',
        path: 'content.modules',
        value: {_type: 'text', body: 'third'},
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules).toHaveLength(3);
      expect(result.fields.content.modules[2]).toEqual({
        _type: 'text',
        body: 'third',
      });
    }
  });

  it('inserts an array item before the given index', () => {
    const result = applyDocEdits(baseFields(), [
      {
        op: 'insert_item',
        path: 'content.modules',
        index: 0,
        value: {_type: 'text', body: 'zeroth'},
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules.map((m: any) => m.body)).toEqual([
        'zeroth',
        'first',
        'second',
      ]);
    }
  });

  it('creates the array when inserting into a missing field', () => {
    const result = applyDocEdits({content: {}}, [
      {
        op: 'insert_item',
        path: 'content.modules',
        value: {_type: 'text', body: 'first'},
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules).toEqual([
        {_type: 'text', body: 'first'},
      ]);
    }
  });

  it('removes an array item by index', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'remove_item', path: 'content.modules', index: 0},
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules).toHaveLength(1);
      expect(result.fields.content.modules[0].body).toBe('second');
    }
  });

  it('applies multiple operations in order', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'remove_item', path: 'content.modules', index: 0},
      {
        op: 'insert_item',
        path: 'content.modules',
        value: {_type: 'text', body: 'third'},
      },
      {op: 'set', path: 'content.modules.1.body', value: 'third-edited'},
      {op: 'set', path: 'hero.title', value: 'Combined'},
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.content.modules.map((m: any) => m.body)).toEqual([
        'second',
        'third-edited',
      ]);
      expect(result.fields.hero.title).toBe('Combined');
    }
  });

  it('does not mutate the input fields', () => {
    const input = baseFields();
    applyDocEdits(input, [
      {op: 'set', path: 'hero.title', value: 'Changed'},
      {op: 'remove_item', path: 'content.modules', index: 0},
    ]);
    expect(input.hero.title).toBe('Old title');
    expect(input.content.modules).toHaveLength(2);
  });

  it('reports the index of the failing operation', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'hero.title', value: 'ok'},
      {op: 'remove_item', path: 'content.modules', index: 9},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.opIndex).toBe(1);
      expect(result.error.op).toBe('remove_item');
    }
  });

  it('rejects a set without a value', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'hero.title'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({op: 'set', expected: 'value'});
    }
  });

  it('rejects an insert without a value', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'insert_item', path: 'content.modules'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        op: 'insert_item',
        expected: 'value',
      });
    }
  });

  it('rejects a remove without an index', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'remove_item', path: 'content.modules'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        op: 'remove_item',
        expected: 'index',
      });
    }
  });

  it('rejects a remove index out of range', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'remove_item', path: 'content.modules', index: 5},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/out of range/i);
    }
  });

  it('rejects an insert index out of range', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'insert_item', path: 'content.modules', index: 9, value: {}},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/out of range/i);
    }
  });

  it('rejects insert when the target is not an array', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'insert_item', path: 'hero.title', value: 'x'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        op: 'insert_item',
        expected: 'array',
      });
    }
  });

  it('rejects remove when the target is not an array', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'remove_item', path: 'hero', index: 0},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        op: 'remove_item',
        expected: 'array',
      });
    }
  });

  it('rejects "fields."-prefixed paths', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'fields.hero.title', value: 'x'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.expected).toBe('field path without fields prefix');
    }
  });

  it('rejects bracket notation in paths', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'content.modules[0].body', value: 'x'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.expected).toBe('dotted array index path');
    }
  });

  it('rejects an out-of-range array index in the middle of a path', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'set', path: 'content.modules.9.body', value: 'x'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.path).toBe('content.modules.9');
    }
  });

  it('rejects an unknown operation', () => {
    const result = applyDocEdits(baseFields(), [
      {op: 'replace' as any, path: 'hero.title', value: 'x'},
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/unknown operation/i);
    }
  });
});

describe('getReleaseStatus', () => {
  it('returns "unpublished" when no stamps are set', () => {
    expect(getReleaseStatus({})).toBe('unpublished');
  });

  it('returns "scheduled" when only scheduledAt is set', () => {
    expect(getReleaseStatus({scheduledAt: 1234})).toBe('scheduled');
  });

  it('returns "published" when publishedAt is set', () => {
    expect(getReleaseStatus({publishedAt: 1234})).toBe('published');
  });

  it('prefers "published" over "scheduled"', () => {
    expect(getReleaseStatus({publishedAt: 1234, scheduledAt: 5678})).toBe(
      'published'
    );
  });

  it('prefers "archived" over everything else', () => {
    expect(
      getReleaseStatus({archivedAt: 1, publishedAt: 2, scheduledAt: 3})
    ).toBe('archived');
  });

  it('treats truthy Timestamp-like objects as set', () => {
    expect(getReleaseStatus({scheduledAt: {toMillis: () => 1}})).toBe(
      'scheduled'
    );
  });
});

describe('computeReleaseDocIds', () => {
  it('adds docs, deduped and sorted', () => {
    expect(
      computeReleaseDocIds(['Pages/home'], ['BlogPosts/a', 'Pages/home'])
    ).toEqual(['BlogPosts/a', 'Pages/home']);
  });

  it('removes docs', () => {
    expect(
      computeReleaseDocIds(['Pages/a', 'Pages/b'], undefined, ['Pages/a'])
    ).toEqual(['Pages/b']);
  });

  it('applies adds and removes together, removal winning on overlap', () => {
    expect(
      computeReleaseDocIds(['Pages/a'], ['Pages/b', 'Pages/c'], ['Pages/b'])
    ).toEqual(['Pages/a', 'Pages/c']);
  });

  it('ignores removals of docs not in the release', () => {
    expect(computeReleaseDocIds(['Pages/a'], [], ['Pages/zzz'])).toEqual([
      'Pages/a',
    ]);
  });

  it('dedupes an existing list with duplicates', () => {
    expect(computeReleaseDocIds(['Pages/a', 'Pages/a'], [], [])).toEqual([
      'Pages/a',
    ]);
  });

  it('returns an empty list when everything is removed', () => {
    expect(computeReleaseDocIds(['Pages/a'], undefined, ['Pages/a'])).toEqual(
      []
    );
  });

  it('does not mutate the inputs', () => {
    const existing = ['Pages/b', 'Pages/a'];
    computeReleaseDocIds(existing, ['Pages/c'], ['Pages/a']);
    expect(existing).toEqual(['Pages/b', 'Pages/a']);
  });
});

describe('release tools wiring', () => {
  function stubBackend(): CmsToolReadBackend {
    return {
      listCollections: async () => [],
      listDocs: async () => [],
      getDoc: async () => null,
      getDocVersion: async () => null,
      listVersions: async () => [],
      getSchemaFields: async () => null,
      listReleases: async ({limit}) => {
        return [
          {
            id: 'spring-launch',
            docIds: ['Pages/home'],
            dataSourceIds: [],
            status: 'unpublished' as const,
          },
        ].slice(0, limit);
      },
      getRelease: async (releaseId) => {
        if (releaseId !== 'spring-launch') {
          return null;
        }
        return {
          id: 'spring-launch',
          docIds: ['Pages/home'],
          dataSourceIds: [],
          status: 'unpublished' as const,
        };
      },
    };
  }

  it('exposes read tools with execute and write tools schema-only', () => {
    const tools = createCmsTools(stubBackend());
    expect(tools.releases_list.execute).toBeTypeOf('function');
    expect(tools.release_get.execute).toBeTypeOf('function');
    // Write tools are executed in the browser via `onToolCall` so the user
    // can approve them first — they must NOT carry an execute here.
    expect(tools.release_create.execute).toBeUndefined();
    expect(tools.release_update.execute).toBeUndefined();
  });

  it('releases_list returns releases from the backend', async () => {
    const tools = createCmsTools(stubBackend());
    const result: any = await (tools.releases_list.execute as any)(
      {limit: 10},
      {} as any
    );
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].id).toBe('spring-launch');
  });

  it('release_get reports found/not-found', async () => {
    const tools = createCmsTools(stubBackend());
    const found: any = await (tools.release_get.execute as any)(
      {releaseId: 'spring-launch'},
      {} as any
    );
    expect(found).toMatchObject({found: true});
    expect(found.release.status).toBe('unpublished');
    const missing: any = await (tools.release_get.execute as any)(
      {releaseId: 'nope'},
      {} as any
    );
    expect(missing).toEqual({found: false});
  });

  it('includes release read tools (but not write tools) in the read-only set', () => {
    const tools = createReadOnlyCmsTools(stubBackend());
    expect(tools.releases_list).toBeDefined();
    expect(tools.release_get).toBeDefined();
    expect(tools.release_create).toBeUndefined();
    expect(tools.release_update).toBeUndefined();
    expect(tools.doc_set).toBeUndefined();
  });
});
