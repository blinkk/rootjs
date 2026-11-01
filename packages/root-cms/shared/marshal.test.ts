import {describe, it, expect} from 'vitest';
import {
  marshalData,
  repairArrayObject,
  unmarshalData,
  isRichTextData,
  resolveArrayObjectPath,
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

describe('marshalData array keys', () => {
  it('replaces duplicate and invalid array keys', () => {
    const result = marshalData([
      {_arrayKey: 'abc', n: 1},
      {_arrayKey: 'abc', n: 2},
      {_arrayKey: 'a.b', n: 3},
    ]);
    expect(new Set(result._array).size).toBe(3);
    expect(result._array[0]).toBe('abc');
    expect(result._array).not.toContain('a.b');
    expect(result._array.map((key: string) => result[key].n)).toEqual([
      1, 2, 3,
    ]);
  });

  it('replaces numeric keys and keeps human-readable ones', () => {
    const result = marshalData([
      {_arrayKey: '0', n: 1},
      {_arrayKey: '123', n: 2},
      {_arrayKey: 'hero-section', n: 3},
    ]);
    expect(result._array[2]).toBe('hero-section');
    for (const key of result._array) {
      expect(key).not.toMatch(/^\d+$/);
    }
    expect(result._array.map((key: string) => result[key].n)).toEqual([
      1, 2, 3,
    ]);
  });

  it('round-trips keys with preserveArrayKeys', () => {
    const stored = {_array: ['abc'], abc: {title: 'a'}};
    const plain = unmarshalData(stored, {preserveArrayKeys: true});
    expect(plain).toEqual([{title: 'a', _arrayKey: 'abc'}]);
    expect(marshalData(plain)).toEqual(stored);
  });
});

describe('repairArrayObject', () => {
  it('leaves a valid array object as is', () => {
    expect(
      repairArrayObject({_array: ['abc', 'xyz'], abc: {n: 1}, xyz: {n: 2}})
    ).toEqual({
      items: [
        {n: 1, _arrayKey: 'abc'},
        {n: 2, _arrayKey: 'xyz'},
      ],
      repaired: false,
    });
  });

  it('builds the order when `_array` is missing', () => {
    const result = repairArrayObject({1: {n: 2}, 0: {n: 1}});
    expect(result?.repaired).toBe(true);
    expect(result?.items.map((item) => item.n)).toEqual([1, 2]);
  });

  it('merges a write to an index into the item at that index', () => {
    const result = repairArrayObject({
      _array: ['abc', 'xyz'],
      abc: {title: 'a', body: 'b'},
      xyz: {title: 'c'},
      0: {title: 'new'},
    });
    expect(result?.repaired).toBe(true);
    expect(result?.items).toEqual([
      {title: 'new', body: 'b', _arrayKey: 'abc'},
      {title: 'c', _arrayKey: 'xyz'},
    ]);
  });

  it('adds items missing from `_array` to the end', () => {
    const result = repairArrayObject({_array: ['a'], a: {n: 1}, b: {n: 2}});
    expect(result?.items.map((item) => item.n)).toEqual([1, 2]);
  });

  it('drops `_array` entries that are duplicated or have no item', () => {
    const result = repairArrayObject({
      _array: ['a', 'a', 'gone', 7],
      a: {n: 1},
    });
    expect(result?.repaired).toBe(true);
    expect(result?.items).toEqual([{n: 1, _arrayKey: 'a'}]);
  });

  it('flags numeric keys', () => {
    expect(repairArrayObject({_array: ['0'], 0: {n: 1}})?.repaired).toBe(true);
  });

  it('ignores values that are not a map of items', () => {
    expect(repairArrayObject([{n: 1}])).toBe(null);
    expect(repairArrayObject({_type: 'Hero', title: 'x'})).toBe(null);
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
