import {describe, expect, it} from 'vitest';
import {removeOverlappingChildUpdates} from './useDraftDoc.js';

describe('removeOverlappingChildUpdates', () => {
  it('keeps parent updates and removes overlapping descendant updates', () => {
    expect(
      removeOverlappingChildUpdates({
        'fields.meta.title': 'Stale title',
        'fields.meta': undefined,
        'fields.meta.image.src': 'Stale image',
        'fields.other.title': 'Other title',
      })
    ).toEqual({
      'fields.meta': undefined,
      'fields.other.title': 'Other title',
    });
  });
});