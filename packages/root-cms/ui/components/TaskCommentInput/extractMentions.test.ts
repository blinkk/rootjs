import {describe, expect, it} from 'vitest';
import {extractAgentMentions, extractMentions} from './TaskCommentInput.js';

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

describe('extractAgentMentions', () => {
  it('extracts a slug-shaped agent mention', () => {
    expect(extractAgentMentions('Hello @content-manager')).toEqual([
      'content-manager',
    ]);
  });

  it('extracts multiple mentions and dedupes them', () => {
    expect(
      extractAgentMentions(
        'cc @content-manager and @translator, also again @content-manager'
      ).sort()
    ).toEqual(['content-manager', 'translator']);
  });

  it('does not mistake email mentions for agent mentions', () => {
    expect(extractAgentMentions('Hello @alex@example.com')).toEqual([]);
  });

  it('ignores tokens that are not at a word boundary', () => {
    expect(extractAgentMentions('inline-text@content-manager')).toEqual([]);
  });

  it('handles mixed agent and email mentions in the same string', () => {
    const content = '@translator please cc @alex@example.com';
    expect(extractAgentMentions(content)).toEqual(['translator']);
    expect(extractMentions(content)).toEqual(['alex@example.com']);
  });

  it('returns an empty array on empty input', () => {
    expect(extractAgentMentions('')).toEqual([]);
  });
});
