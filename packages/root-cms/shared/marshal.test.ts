import {describe, it, expect} from 'vitest';
import {
  marshalData,
  unmarshalData,
  isArrayObject,
  isRichTextData,
  resolveArrayObjectPath,
  collectPathsByPredicate,
} from './marshal.js';

describe('marshalData', () => {
  it('returns primitives as-is', () => {
    expect(marshalData(null)).toBe(null);
    expect(marshalData(undefined)).toBe(undefined);
    expect(marshalData(42)).toBe(42);
    expect(marshalData('hello')).toBe('hello');
    expect(marshalData(true)).toBe(true);
  });

  it('converts a plain array to ArrayObject', () => {
    const result = marshalData([{title: 'a'}, {title: 'b'}]);
    expect(result._array).toHaveLength(2);
    const first = result[result._array[0]];
    const second = result[result._array[1]];
    expect(first).toEqual({title: 'a'});
    expect(second).toEqual({title: 'b'});
  });

  it('uses _arrayKey when provided', () => {
    const result = marshalData([
      {_arrayKey: 'key1', title: 'a'},
      {_arrayKey: 'key2', title: 'b'},
    ]);
    expect(result._array).toEqual(['key1', 'key2']);
    expect(result.key1).toEqual({title: 'a'});
    expect(result.key2).toEqual({title: 'b'});
  });

  it('does not marshal rich text data (EditorJS format)', () => {
    const richTextData = {
      time: 1721761211720,
      version: '2.28.2',
      blocks: [
        {data: {text: 'Hello <b>world</b>'}, type: 'paragraph'},
        {data: {text: 'Second paragraph'}, type: 'paragraph'},
      ],
    };

    const result = marshalData(richTextData);

    // Rich text data should be returned as-is, blocks remain a plain array.
    expect(result).toBe(richTextData);
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toEqual({
      data: {text: 'Hello <b>world</b>'},
      type: 'paragraph',
    });
  });

  it('handles nested objects containing rich text data', () => {
    const fields = {
      title: 'My Post',
      body: {
        time: 1721761211720,
        version: '2.28.2',
        blocks: [{data: {text: 'Paragraph'}, type: 'paragraph'}],
      },
    };

    const result = marshalData(fields);
    expect(result.title).toBe('My Post');
    // body is rich text — returned as-is with blocks as a plain array.
    expect(result.body).toBe(fields.body);
    expect(Array.isArray(result.body.blocks)).toBe(true);
  });

  it('recursively marshals nested arrays', () => {
    const data = {
      items: [{name: 'one', tags: ['a', 'b']}],
    };
    const result = marshalData(data);
    // items becomes ArrayObject
    expect(result.items._array).toHaveLength(1);
    const itemKey = result.items._array[0];
    // tags (string array) becomes ArrayObject too
    expect(result.items[itemKey].tags._array).toHaveLength(2);
  });

  it('handles empty arrays', () => {
    const result = marshalData([]);
    expect(result).toEqual({_array: []});
  });

  it('handles empty objects', () => {
    const result = marshalData({});
    expect(result).toEqual({});
  });

  it('strips undefined values from objects', () => {
    const result = marshalData({a: 1, b: undefined, c: 'x'});
    expect(result).toEqual({a: 1, c: 'x'});
    expect('b' in result).toBe(false);
  });
});

describe('unmarshalData', () => {
  it('returns primitives as-is', () => {
    expect(unmarshalData(null)).toBe(null);
    expect(unmarshalData(undefined)).toBe(undefined);
    expect(unmarshalData(42)).toBe(42);
    expect(unmarshalData('hello')).toBe('hello');
  });

  it('converts ArrayObject back to an array', () => {
    const input = {
      key1: {title: 'a'},
      key2: {title: 'b'},
      _array: ['key1', 'key2'],
    };
    const result = unmarshalData(input);
    expect(result).toEqual([{title: 'a'}, {title: 'b'}]);
  });

  it('recursively unmarshals nested ArrayObjects', () => {
    const input = {
      title: 'Post',
      items: {
        k1: {name: 'one'},
        _array: ['k1'],
      },
    };
    const result = unmarshalData(input);
    expect(result).toEqual({
      title: 'Post',
      items: [{name: 'one'}],
    });
  });

  it('handles Timestamp-like objects with toMillis', () => {
    const ts = {toMillis: () => 1700000000000};
    const input = {createdAt: ts, title: 'hi'};
    const result = unmarshalData(input);
    expect(result).toEqual({createdAt: 1700000000000, title: 'hi'});
  });

  it('handles custom isTimestamp/timestampToValue options', () => {
    const ts = {_seconds: 1700000, _nanoseconds: 0};
    const input = {createdAt: ts, title: 'hi'};
    const result = unmarshalData(input, {
      isTimestamp: (v) => '_seconds' in v && '_nanoseconds' in v,
      timestampToValue: (v) => v._seconds * 1000,
    });
    expect(result).toEqual({createdAt: 1700000000, title: 'hi'});
  });

  it('handles rich text blocks (ArrayObject with nested data)', () => {
    const input = {
      body: {
        blocks: {
          bmrwg0: {data: {text: 'Hello'}, type: 'paragraph'},
          iqggkv: {data: {text: 'World'}, type: 'paragraph'},
          _array: ['bmrwg0', 'iqggkv'],
        },
      },
    };
    const result = unmarshalData(input);
    expect(result.body.blocks).toEqual([
      {data: {text: 'Hello'}, type: 'paragraph'},
      {data: {text: 'World'}, type: 'paragraph'},
    ]);
  });

  it('handles plain arrays', () => {
    const input = {tags: ['a', 'b', 'c']};
    const result = unmarshalData(input);
    expect(result).toEqual({tags: ['a', 'b', 'c']});
  });

  it('handles empty ArrayObject', () => {
    const input = {_array: []};
    const result = unmarshalData(input);
    expect(result).toEqual([]);
  });
});

describe('isArrayObject', () => {
  it('returns true for objects with _array', () => {
    expect(isArrayObject({_array: ['a'], a: 1})).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isArrayObject({foo: 'bar'})).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isArrayObject([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isArrayObject(null)).toBe(false);
  });
});

describe('resolveArrayObjectPath', () => {
  const data = {
    content: {
      modules: {
        first: {
          title: 'One',
          links: {
            link1: {label: 'A'},
            link2: {label: 'B'},
            _array: ['link1', 'link2'],
          },
        },
        second: {title: 'Two'},
        _array: ['first', 'second'],
      },
    },
  };

  it('leaves paths to whole array fields unchanged', () => {
    expect(resolveArrayObjectPath(data, 'content.modules')).toEqual({
      ok: true,
      path: 'content.modules',
      segments: ['content', 'modules'],
    });
  });

  it('maps array item indices to stored array keys', () => {
    expect(resolveArrayObjectPath(data, 'content.modules.0.title')).toEqual({
      ok: true,
      path: 'content.modules.first.title',
      segments: ['content', 'modules', 'first', 'title'],
    });
  });

  it('maps nested array item indices to stored array keys', () => {
    expect(
      resolveArrayObjectPath(data, 'content.modules.0.links.1.label')
    ).toEqual({
      ok: true,
      path: 'content.modules.first.links.link2.label',
      segments: ['content', 'modules', 'first', 'links', 'link2', 'label'],
    });
  });

  it('rejects out-of-range array item indices', () => {
    const result = resolveArrayObjectPath(data, 'content.modules.2.title');
    expect(result).toMatchObject({
      ok: false,
      error: {
        path: 'content.modules.2',
        expected: 'existing array item',
        received: '2',
      },
    });
  });

  it('rejects nested array fields without a numeric index', () => {
    const result = resolveArrayObjectPath(data, 'content.modules.title');
    expect(result).toMatchObject({
      ok: false,
      error: {
        path: 'content.modules.title',
        expected: 'array index',
        received: 'title',
      },
    });
  });
});

describe('roundtrip: marshal → unmarshal', () => {
  it('simple array of objects', () => {
    const original = [{title: 'a'}, {title: 'b'}];
    const marshaled = marshalData(original);
    const unmarshaled = unmarshalData(marshaled);
    expect(unmarshaled).toEqual(original);
  });

  it('nested document fields', () => {
    const original = {
      title: 'Post',
      tags: ['news', 'update'],
      sections: [
        {heading: 'Intro', body: 'Hello'},
        {heading: 'Conclusion', body: 'Bye'},
      ],
    };
    const marshaled = marshalData(original);
    const unmarshaled = unmarshalData(marshaled);
    expect(unmarshaled).toEqual(original);
  });
});

describe('isRichTextData', () => {
  it('returns true for EditorJS-style rich text data', () => {
    expect(
      isRichTextData({
        time: 1721761211720,
        version: '2.28.2',
        blocks: [{type: 'paragraph', data: {text: 'Hello'}}],
      })
    ).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isRichTextData({foo: 'bar'})).toBe(false);
  });

  it('returns false for objects missing version', () => {
    expect(isRichTextData({time: 123, blocks: []})).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRichTextData([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRichTextData(null)).toBe(false);
  });

  it('returns false when `blocks` uses `_array` object notation', () => {
    // Rich text data should never round-trip through `marshalData` with
    // `_array` blocks. Returning false here means `marshalData` will treat
    // the value as a regular nested object and re-marshal the inner
    // `_array` array — surfacing the corruption rather than persisting it.
    expect(
      isRichTextData({
        time: 1721761211720,
        version: 'lexical-0.31.2',
        blocks: {
          _array: ['abc'],
          abc: {type: 'paragraph', data: {text: 'Hello'}},
        },
      })
    ).toBe(false);
  });
});

describe('collectPathsByPredicate', () => {
  // Matches inline values backed by a library asset, like the fan-out walk does.
  const isAsset = (n: any) => !!n && typeof n === 'object' && !!n.assetId;

  it('collects a top-level matching field', () => {
    const fields = {
      title: 'Home',
      hero: {src: 'a', assetId: 'logo'},
    };
    expect(
      collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})
    ).toEqual(['fields.hero']);
  });

  it('does not descend into a matched node', () => {
    const fields = {
      hero: {src: 'a', assetId: 'logo', nested: {assetId: 'inner'}},
    };
    // Only the outer match is collected; the walk stops at it.
    expect(
      collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})
    ).toEqual(['fields.hero']);
  });

  it('uses stored ArrayObject keys (not numeric indices) for array items', () => {
    const fields = {
      modules: {
        _array: ['k1', 'k2'],
        k1: {image: {src: 'a', assetId: 'logo'}},
        k2: {image: {src: 'b'}},
      },
    };
    expect(
      collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})
    ).toEqual(['fields.modules.k1.image']);
  });

  it('reaches assets inside oneOf blocks (skips the _type marker)', () => {
    const fields = {
      blocks: {
        _array: ['b1'],
        b1: {_type: 'ImageBlock', image: {src: 'a', assetId: 'logo'}},
      },
    };
    expect(
      collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})
    ).toEqual(['fields.blocks.b1.image']);
  });

  it('skips rich text data', () => {
    const fields = {
      body: {
        time: 1,
        version: '2.0',
        blocks: [{type: 'image', data: {file: {assetId: 'logo'}}}],
      },
    };
    expect(collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})).toEqual(
      []
    );
  });

  it('skips `@<field>` metadata siblings', () => {
    const fields = {
      image: {src: 'a', assetId: 'logo'},
      '@image': {alt: false, assetId: 'should-be-ignored'},
    };
    expect(
      collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})
    ).toEqual(['fields.image']);
  });

  it('collects multiple matches across nested structures', () => {
    const fields = {
      hero: {src: 'a', assetId: 'logo'},
      meta: {ogImage: {src: 'b', assetId: 'logo'}},
      gallery: {
        _array: ['g1', 'g2'],
        g1: {photo: {src: 'c', assetId: 'logo'}},
        g2: {photo: {src: 'd', assetId: 'other'}},
      },
    };
    const onlyLogo = (n: any) => isAsset(n) && n.assetId === 'logo';
    expect(
      collectPathsByPredicate(fields, onlyLogo, {prefix: 'fields'}).sort()
    ).toEqual(['fields.gallery.g1.photo', 'fields.hero', 'fields.meta.ogImage']);
  });

  it('returns no paths when nothing matches', () => {
    const fields = {title: 'Home', hero: {src: 'a'}};
    expect(collectPathsByPredicate(fields, isAsset, {prefix: 'fields'})).toEqual(
      []
    );
  });
});
