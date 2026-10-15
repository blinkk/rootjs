import {describe, expect, it} from 'vitest';
import {
  applyReplaceRule,
  classifySourceChange,
  diffStrings,
  findPlaceholderMismatches,
  portTranslation,
  rankBySimilarity,
  similarity,
} from './translation-port.js';

describe('diffStrings', () => {
  it('returns token-level diff ops', () => {
    expect(diffStrings('Buy Pixel 9 now', 'Buy Pixel 10 now')).toEqual([
      {type: 'equal', text: 'Buy Pixel '},
      {type: 'delete', text: '9'},
      {type: 'insert', text: '10'},
      {type: 'equal', text: ' now'},
    ]);
  });

  it('handles identical and empty strings', () => {
    expect(diffStrings('Hello', 'Hello')).toEqual([
      {type: 'equal', text: 'Hello'},
    ]);
    expect(diffStrings('', 'Hello')).toEqual([{type: 'insert', text: 'Hello'}]);
  });
});

describe('applyReplaceRule', () => {
  it('replaces literal text case-insensitively by default', () => {
    expect(
      applyReplaceRule('Pixel pixel PIXEL', {find: 'pixel', replace: 'Nest'})
    ).toEqual({text: 'Nest Nest Nest', count: 3});
  });

  it('supports case-sensitive matching', () => {
    expect(
      applyReplaceRule('Pixel pixel', {
        find: 'Pixel',
        replace: 'Nest',
        caseSensitive: true,
      })
    ).toEqual({text: 'Nest pixel', count: 1});
  });

  it('inserts literal replacements as-is', () => {
    expect(
      applyReplaceRule('price', {find: 'price', replace: '$1 & $&'})
    ).toEqual({text: '$1 & $&', count: 1});
  });

  it('supports regex capture groups', () => {
    expect(
      applyReplaceRule('Pixel 9 / Pixel 9a', {
        find: 'Pixel (\\d+)(a?)',
        replace: 'Pixel 1$1$2 ($&)',
        regex: true,
      })
    ).toEqual({text: 'Pixel 19 (Pixel 9) / Pixel 19a (Pixel 9a)', count: 2});
  });

  it('supports named groups', () => {
    expect(
      applyReplaceRule('v1', {
        find: 'v(?<num>\\d)',
        replace: 'version $1',
        regex: true,
      })
    ).toEqual({text: 'version 1', count: 1});
  });

  it('returns an error for invalid regexes', () => {
    const result = applyReplaceRule('text', {
      find: '(',
      replace: '',
      regex: true,
    });
    expect(result.text).toBe('text');
    expect(result.count).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('ignores empty rules', () => {
    expect(applyReplaceRule('text', {find: '', replace: 'x'})).toEqual({
      text: 'text',
      count: 0,
    });
  });
});

describe('portTranslation', () => {
  it('applies rules in order', () => {
    const result = portTranslation({
      translation: 'Hol dir Pixel 9 in 2025',
      rules: [
        {find: 'Hol dir', replace: 'Kaufe'},
        {find: 'Kaufe', replace: 'Kauf'},
      ],
    });
    expect(result).toEqual({text: 'Kauf Pixel 9 in 2025', ruleCounts: [1, 1]});
  });
});

describe('classifySourceChange', () => {
  it('classifies changes', () => {
    expect(classifySourceChange('Hello  world', 'Hello world')).toBe('same');
    expect(classifySourceChange("Don't stop.", 'Don’t stop!')).toBe('minor');
    expect(classifySourceChange('Sign Up', 'Sign up')).toBe('minor');
    expect(classifySourceChange('Sign up', 'Sign up now')).toBe('edit');
  });
});

describe('similarity', () => {
  it('scores strings by shared words', () => {
    expect(similarity('Sign up now', 'Sign up now')).toBe(1);
    expect(similarity('Sign up now', 'Sign up today')).toBeCloseTo(2 / 3);
    expect(similarity('Hello', 'Goodbye')).toBe(0);
    expect(similarity('', '')).toBe(1);
  });
});

describe('rankBySimilarity', () => {
  it('sorts candidates by similarity', () => {
    const ranked = rankBySimilarity('Buy Pixel 10 today', [
      {source: 'Contact us'},
      {source: 'Buy Pixel 9 today'},
      {source: 'Buy today'},
    ]);
    expect(ranked.map((c) => c.source)).toEqual([
      'Buy Pixel 9 today',
      'Buy today',
      'Contact us',
    ]);
    expect(ranked[0].score).toBeCloseTo(0.75);
  });
});

describe('findPlaceholderMismatches', () => {
  it('finds missing and extra placeholders', () => {
    expect(
      findPlaceholderMismatches(
        'Hi {name}, you have {count} items and %s',
        'Hola {nombre}, tienes {count} artículos y %s'
      )
    ).toEqual({missing: ['{name}'], extra: ['{nombre}']});
    expect(
      findPlaceholderMismatches('Hi {{ name }}', 'Hola {{ name }}')
    ).toEqual({missing: [], extra: []});
  });
});
