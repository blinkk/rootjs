import {describe, expect, it} from 'vitest';
import {extractMentions} from './TaskCommentInput.js';

describe('extractMentions', () => {
  it('extracts a single @email mention', () => {
    expect(extractMentions('Hello @alex@example.com')).toEqual([
      'alex@example.com',
    ]);
  });

  it('extracts multiple mentions and dedupes them', () => {
    const content =
      'cc @a@x.com and @b@x.com, also again @a@x.com please review';
    expect(extractMentions(content).sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('lowercases mentions', () => {
    expect(extractMentions('@Alex@Example.COM')).toEqual(['alex@example.com']);
  });

  it('ignores @-tokens that are not at a word boundary', () => {
    expect(extractMentions('email me at user@example.com')).toEqual([]);
  });

  it('returns an empty array when no mentions are present', () => {
    expect(extractMentions('No mentions here')).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });
});
