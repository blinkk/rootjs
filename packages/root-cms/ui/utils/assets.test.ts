import {describe, expect, it} from 'vitest';
import {
  AssetFile,
  AssetNameError,
  buildAssetFieldValue,
  buildSyncedFieldValue,
  collectAssetFieldPaths,
  extractAssetIds,
  getFolderId,
  getRelativeFolderPath,
  joinFolderPath,
  parseFolderPath,
  validateAssetName,
} from './assets.js';

function testAsset(file: Record<string, any> = {}): AssetFile {
  return {
    id: 'asset123',
    type: 'file',
    parent: 'marketing',
    name: 'hero.png',
    file: {
      src: 'https://example.com/new.png',
      filename: 'new.png',
      width: 100,
      height: 50,
      alt: 'New alt',
      ...file,
    },
  } as AssetFile;
}

describe('validateAssetName', () => {
  it('trims and returns valid names', () => {
    expect(validateAssetName('  hero.png ')).toEqual('hero.png');
    expect(validateAssetName('Q1 2026')).toEqual('Q1 2026');
  });

  it('throws on empty names', () => {
    expect(() => validateAssetName('')).toThrow(AssetNameError);
    expect(() => validateAssetName('   ')).toThrow(AssetNameError);
  });

  it('throws on names with slashes', () => {
    expect(() => validateAssetName('a/b')).toThrow(AssetNameError);
    expect(() => validateAssetName('a\\b')).toThrow(AssetNameError);
  });

  it('throws on dot names', () => {
    expect(() => validateAssetName('.')).toThrow(AssetNameError);
    expect(() => validateAssetName('..')).toThrow(AssetNameError);
  });
});

describe('folder paths', () => {
  it('joins parent paths and names', () => {
    expect(joinFolderPath('', 'foo')).toEqual('foo');
    expect(joinFolderPath('foo', 'bar')).toEqual('foo/bar');
  });

  it('parses folder paths into segments', () => {
    expect(parseFolderPath('')).toEqual([]);
    expect(parseFolderPath('foo')).toEqual(['foo']);
    expect(parseFolderPath('foo/bar')).toEqual(['foo', 'bar']);
  });

  it('builds deterministic folder ids', () => {
    expect(getFolderId('foo/bar')).toEqual('folder-foo%2Fbar');
    expect(getFolderId('foo/bar')).toEqual(getFolderId('foo/bar'));
  });

  it('returns folder paths relative to a base folder', () => {
    expect(getRelativeFolderPath('marketing/q1', 'marketing')).toEqual('q1');
    expect(getRelativeFolderPath('marketing/q1/img', 'marketing')).toEqual(
      'q1/img'
    );
    expect(getRelativeFolderPath('marketing', 'marketing')).toEqual('');
    expect(getRelativeFolderPath('marketing/q1', '')).toEqual('marketing/q1');
    // Sibling prefix folders are not treated as relative.
    expect(getRelativeFolderPath('marketingX', 'marketing')).toEqual(
      'marketingX'
    );
  });
});

describe('extractAssetIds', () => {
  it('extracts asset ids from unmarshaled data', () => {
    const fields = {
      image: {src: 'https://example.com/a.png', assetId: 'aaa'},
      blocks: [
        {image: {src: 'https://example.com/b.png', assetId: 'bbb'}},
        {file: {src: 'https://example.com/c.pdf', assetId: 'aaa'}},
      ],
    };
    expect(extractAssetIds(fields)).toEqual(['aaa', 'bbb']);
  });

  it('extracts asset ids from marshaled data', () => {
    const fields = {
      blocks: {
        _array: ['k1'],
        k1: {image: {src: 'https://example.com/a.png', assetId: 'zzz'}},
      },
    };
    expect(extractAssetIds(fields)).toEqual(['zzz']);
  });

  it('ignores files without an assetId', () => {
    const fields = {
      image: {src: 'https://example.com/a.png'},
      nested: {assetId: 'no-src-here'},
    };
    expect(extractAssetIds(fields)).toEqual([]);
  });

  it('returns a sorted list of unique ids', () => {
    const fields = {
      a: {src: 'x', assetId: 'zzz'},
      b: {src: 'x', assetId: 'aaa'},
      c: {src: 'x', assetId: 'zzz'},
    };
    expect(extractAssetIds(fields)).toEqual(['aaa', 'zzz']);
  });

  it('handles empty/invalid data', () => {
    expect(extractAssetIds(null)).toEqual([]);
    expect(extractAssetIds(undefined)).toEqual([]);
    expect(extractAssetIds({})).toEqual([]);
    expect(extractAssetIds('str')).toEqual([]);
  });
});

describe('collectAssetFieldPaths', () => {
  it('collects dot-notation paths for embedded asset values', () => {
    const fields = {
      image: {src: 'https://example.com/a.png', assetId: 'aaa'},
      blocks: {
        _array: ['k1', 'k2'],
        k1: {image: {src: 'https://example.com/b.png', assetId: 'aaa'}},
        k2: {image: {src: 'https://example.com/c.png', assetId: 'bbb'}},
      },
    };
    const found: Array<{path: string; value: any}> = [];
    collectAssetFieldPaths(fields, 'aaa', 'fields', found);
    expect(found.map((f) => f.path)).toEqual([
      'fields.image',
      'fields.blocks.k1.image',
    ]);
  });

  it('does not recurse into matched values', () => {
    const fields = {
      image: {
        src: 'https://example.com/a.png',
        assetId: 'aaa',
        nested: {src: 'x', assetId: 'aaa'},
      },
    };
    const found: Array<{path: string; value: any}> = [];
    collectAssetFieldPaths(fields, 'aaa', 'fields', found);
    expect(found.map((f) => f.path)).toEqual(['fields.image']);
  });
});

describe('buildAssetFieldValue', () => {
  it('copies the file data and adds the assetId backlink', () => {
    const value = buildAssetFieldValue(testAsset());
    expect(value).toEqual({
      src: 'https://example.com/new.png',
      filename: 'new.png',
      width: 100,
      height: 50,
      alt: 'New alt',
      assetId: 'asset123',
    });
  });

  it('removes undefined values', () => {
    const value = buildAssetFieldValue(testAsset({width: undefined}));
    expect('width' in value).toBe(false);
  });
});

describe('buildSyncedFieldValue', () => {
  it('overwrites stale embedded data', () => {
    const existing = {
      src: 'https://example.com/old.png',
      filename: 'old.png',
      alt: 'Old alt',
      assetId: 'asset123',
    };
    const previousFile = {src: 'https://example.com/old.png', alt: 'Old alt'};
    const value = buildSyncedFieldValue(testAsset(), existing, previousFile);
    expect(value.src).toEqual('https://example.com/new.png');
    expect(value.alt).toEqual('New alt');
    expect(value.assetId).toEqual('asset123');
  });

  it('preserves doc-customized alt text', () => {
    const existing = {
      src: 'https://example.com/old.png',
      alt: 'Custom doc alt',
      assetId: 'asset123',
    };
    const previousFile = {src: 'https://example.com/old.png', alt: 'Old alt'};
    const value = buildSyncedFieldValue(testAsset(), existing, previousFile);
    expect(value.alt).toEqual('Custom doc alt');
  });

  it('preserves doc-customized canvas bg color', () => {
    const existing = {
      src: 'https://example.com/old.png',
      canvasBgColor: 'dark',
      assetId: 'asset123',
    };
    const previousFile = {
      src: 'https://example.com/old.png',
      alt: 'Old alt',
      canvasBgColor: 'light',
    };
    const value = buildSyncedFieldValue(testAsset(), existing, previousFile);
    expect(value.canvasBgColor).toEqual('dark');
  });
});
