import {describe, expect, it} from 'vitest';
import {testDraftUpdateChangesValue} from './useDraftDoc.js';

describe('testDraftUpdateChangesValue', () => {
  it('returns false for deeply equal values', () => {
    expect(
      testDraftUpdateChangesValue(
        {items: [{title: 'One'}, {title: 'Two'}]},
        {items: [{title: 'One'}, {title: 'Two'}]}
      )
    ).toBe(false);
  });

  it('returns true when values differ', () => {
    expect(testDraftUpdateChangesValue('Published title', 'Draft title')).toBe(
      true
    );
  });

  it('treats same-reference objects as changed', () => {
    const value = {title: 'Maybe mutated in place'};

    expect(testDraftUpdateChangesValue(value, value)).toBe(true);
  });

  it('returns false when deleting an absent value', () => {
    expect(testDraftUpdateChangesValue(undefined, undefined)).toBe(false);
  });

  it('returns true when deleting a present null value', () => {
    expect(testDraftUpdateChangesValue(null, undefined)).toBe(true);
  });

  it('can treat null as a delete operation for batch updates', () => {
    expect(
      testDraftUpdateChangesValue(undefined, null, {deleteNull: true})
    ).toBe(false);
    expect(testDraftUpdateChangesValue(null, null, {deleteNull: true})).toBe(
      true
    );
  });

  it('allows changed metadata array updates', () => {
    expect(testDraftUpdateChangesValue(['en'], ['en', 'es'])).toBe(true);
  });

  it('skips unchanged metadata array updates', () => {
    expect(testDraftUpdateChangesValue(['en', 'es'], ['en', 'es'])).toBe(false);
  });
});
