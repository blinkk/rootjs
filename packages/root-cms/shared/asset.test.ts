import {describe, it, expect} from 'vitest';
import {
  ASSET_ID_KEY,
  Asset,
  assetFieldValueIsCurrent,
  assetToFieldValue,
  buildUsageKey,
  isAssetRef,
} from './asset.js';

const ASSET: Asset = {
  id: 'asset123',
  version: 2,
  src: 'https://lh3.googleusercontent.com/abc',
  filename: 'logo.png',
  gcsPath: '/bucket/project/uploads/abc.png',
  width: 200,
  height: 100,
  canvasBgColor: 'light',
  alt: 'Company logo',
  dir: '/logos',
};

describe('isAssetRef', () => {
  it('returns true for values with a string assetId', () => {
    expect(isAssetRef({src: 'x', assetId: 'asset123'})).toBe(true);
  });

  it('returns false for independent uploads (no assetId)', () => {
    expect(isAssetRef({src: 'x', filename: 'a.png'})).toBe(false);
  });

  it('returns false for empty/non-string assetId', () => {
    expect(isAssetRef({src: 'x', assetId: ''})).toBe(false);
    expect(isAssetRef({src: 'x', assetId: 123})).toBe(false);
  });

  it('returns false for non-objects, null, and arrays', () => {
    expect(isAssetRef(null)).toBe(false);
    expect(isAssetRef('asset123')).toBe(false);
    expect(isAssetRef([{assetId: 'asset123'}])).toBe(false);
  });

  it('uses ASSET_ID_KEY = "assetId"', () => {
    expect(ASSET_ID_KEY).toBe('assetId');
  });
});

describe('assetToFieldValue', () => {
  it('denormalizes the canonical asset fields plus markers', () => {
    const value = assetToFieldValue(ASSET);
    expect(value).toEqual({
      src: 'https://lh3.googleusercontent.com/abc',
      filename: 'logo.png',
      gcsPath: '/bucket/project/uploads/abc.png',
      width: 200,
      height: 100,
      canvasBgColor: 'light',
      alt: 'Company logo',
      assetId: 'asset123',
      assetVersion: 2,
    });
  });

  it('omits undefined optional fields (Firestore rejects undefined)', () => {
    const value = assetToFieldValue({id: 'a1', version: 1, src: 'x'});
    expect(value).toEqual({src: 'x', assetId: 'a1', assetVersion: 1, alt: ''});
    expect('width' in value).toBe(false);
    expect('gcsPath' in value).toBe(false);
  });

  it('does not leak the folder dir onto the inline value', () => {
    const value = assetToFieldValue(ASSET);
    expect('dir' in value).toBe(false);
  });
});

describe('assetFieldValueIsCurrent', () => {
  it('returns true when the inline value already matches the asset', () => {
    const value = assetToFieldValue(ASSET);
    expect(assetFieldValueIsCurrent(value, ASSET)).toBe(true);
  });

  it('returns false when the asset has a newer src/version', () => {
    const stale = assetToFieldValue({...ASSET, version: 1, src: 'old'});
    expect(assetFieldValueIsCurrent(stale, ASSET)).toBe(false);
  });

  it('returns false for a different asset or an independent upload', () => {
    expect(assetFieldValueIsCurrent({src: 'x'}, ASSET)).toBe(false);
    expect(assetFieldValueIsCurrent({src: 'x', assetId: 'other'}, ASSET)).toBe(
      false
    );
  });
});

describe('buildUsageKey', () => {
  it('encodes the docId slash as `--`', () => {
    expect(buildUsageKey('Pages/home')).toBe('Pages--home');
  });

  it('encodes nested slugs', () => {
    expect(buildUsageKey('Pages/blog--post')).toBe('Pages--blog--post');
  });
});
