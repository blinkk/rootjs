import {describe, expect, it} from 'vitest';
import {getStaticCacheControl} from './static-cache.js';

describe('getStaticCacheControl', () => {
  it('caches content-hashed files for good', () => {
    const immutable = 'public, max-age=31536000, immutable';
    expect(getStaticCacheControl('/chunk-7MPTC5OT.js')).toBe(immutable);
    expect(getStaticCacheControl('/DocumentPage-HOBDXIHP.js')).toBe(immutable);
  });

  it('revalidates files whose names do not change between builds', () => {
    expect(getStaticCacheControl('/ui.js')).toBe('no-cache');
    expect(getStaticCacheControl('/ui.css')).toBe('no-cache');
    expect(getStaticCacheControl('/aggrid.css')).toBe('no-cache');
    expect(getStaticCacheControl('/signin.js')).toBe('no-cache');
  });
});
