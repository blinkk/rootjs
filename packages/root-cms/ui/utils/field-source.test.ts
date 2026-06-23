import {beforeEach, describe, expect, it, vi} from 'vitest';

const getDocFromCacheOrFetchMock = vi.fn();

vi.mock('./doc-cache.js', () => ({
  getDocFromCacheOrFetch: (docId: string) => getDocFromCacheOrFetchMock(docId),
}));

import {resolveFieldSource} from './field-source.js';

describe('resolveFieldSource', () => {
  beforeEach(() => {
    getDocFromCacheOrFetchMock.mockReset();
  });

  it('resolves document options from an array-of-objects field', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue({
      fields: {
        flags: {
          _array: ['k1', 'k2'],
          k1: {name: 'EnableFooBar', description: 'Foo bar'},
          k2: {name: 'EnableBaz', description: 'Baz'},
        },
      },
    });
    const options = await resolveFieldSource({
      doc: 'GlobalModules/flags',
      field: 'flags',
      valueKey: 'name',
      labelKey: 'description',
    });
    expect(getDocFromCacheOrFetchMock).toHaveBeenCalledWith(
      'GlobalModules/flags'
    );
    expect(options).toEqual([
      {value: 'EnableFooBar', label: 'Foo bar'},
      {value: 'EnableBaz', label: 'Baz'},
    ]);
  });

  it('includes a description resolved from helpKey', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue({
      fields: {
        flags: {
          _array: ['k1'],
          k1: {name: 'EnableFooBar', description: 'Foo bar'},
        },
      },
    });
    const options = await resolveFieldSource({
      doc: 'GlobalModules/flags',
      field: 'flags',
      valueKey: 'name',
      helpKey: 'description',
    });
    expect(options).toEqual([
      {value: 'EnableFooBar', label: 'EnableFooBar', description: 'Foo bar'},
    ]);
  });

  it('uses the value as the label when no label sub-field resolves', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue({
      fields: {
        flags: {
          _array: ['k1'],
          k1: {name: 'EnableFooBar'},
        },
      },
    });
    const options = await resolveFieldSource({
      doc: 'GlobalModules/flags',
      field: 'flags',
      valueKey: 'name',
      labelKey: 'description',
    });
    expect(options).toEqual([{value: 'EnableFooBar', label: 'EnableFooBar'}]);
  });

  it('resolves document options from an array of strings', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue({
      fields: {tags: ['typescript', 'javascript', 'typescript']},
    });
    const options = await resolveFieldSource({
      doc: 'GlobalModules/tags',
      field: 'tags',
    });
    expect(options).toEqual([
      {value: 'typescript', label: 'typescript'},
      {value: 'javascript', label: 'javascript'},
    ]);
  });

  it('returns an empty list when the source field is missing', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue({fields: {}});
    const options = await resolveFieldSource({
      doc: 'GlobalModules/flags',
      field: 'flags',
      valueKey: 'name',
    });
    expect(options).toEqual([]);
  });

  it('returns an empty list when the document does not exist', async () => {
    getDocFromCacheOrFetchMock.mockResolvedValue(undefined);
    const options = await resolveFieldSource({
      doc: 'GlobalModules/missing',
      field: 'flags',
      valueKey: 'name',
    });
    expect(options).toEqual([]);
  });
});
