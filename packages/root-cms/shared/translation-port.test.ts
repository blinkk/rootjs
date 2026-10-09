import {describe, expect, it} from 'vitest';
import {
  applyReplaceRule,
  carryOverSourceEdits,
  classifySourceChange,
  diffStrings,
  findPlaceholderMismatches,
  getSourceHunks,
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

describe('getSourceHunks', () => {
  it('returns each contiguous change', () => {
    expect(getSourceHunks('Pixel 9 Pro', 'Pixel 10 Ultra')).toEqual([
      {oldText: '9', newText: '10'},
      {oldText: 'Pro', newText: 'Ultra'},
    ]);
  });
});

describe('carryOverSourceEdits', () => {
  it('replaces untranslated text that changed in the source', () => {
    const result = carryOverSourceEdits(
      '© 2025 Google LLC. All rights reserved.',
      '© 2026 Google LLC. All rights reserved.',
      '© 2025 Google LLC. Alle Rechte vorbehalten.'
    );
    expect(result.text).toBe('© 2026 Google LLC. Alle Rechte vorbehalten.');
    expect(result.changes).toEqual([
      {oldText: '2025', newText: '2026', status: 'applied'},
    ]);
  });

  it('replaces repeated changes in every occurrence', () => {
    const result = carryOverSourceEdits(
      'Pixel 9 and Pixel 9 Pro',
      'Pixel 10 and Pixel 10 Pro',
      'Pixel 9 y Pixel 9 Pro'
    );
    expect(result.text).toBe('Pixel 10 y Pixel 10 Pro');
    expect(result.changes.every((c) => c.status === 'applied')).toBe(true);
  });

  it('does not replace text within a larger word', () => {
    const result = carryOverSourceEdits(
      'Pixel 9 costs $999',
      'Pixel 10 costs $999',
      'Pixel 9 kostet 999 $'
    );
    expect(result.text).toBe('Pixel 10 kostet 999 $');
  });

  it('applies all changes against the original translation', () => {
    const result = carryOverSourceEdits(
      'Versions 9 and 10',
      'Versions 10 and 11',
      'Versionen 9 und 10'
    );
    expect(result.text).toBe('Versionen 10 und 11');
  });

  it('marks translated text as not found', () => {
    const result = carryOverSourceEdits(
      'Sign up today',
      'Sign up now',
      'Regístrate hoy'
    );
    expect(result.text).toBe('Regístrate hoy');
    expect(result.changes).toEqual([
      {oldText: 'today', newText: 'now', status: 'not-found'},
    ]);
  });

  it('marks insertions', () => {
    const result = carryOverSourceEdits(
      'Learn more',
      'Learn more about Pixel',
      'Más información'
    );
    expect(result.changes).toEqual([
      {oldText: '', newText: ' about Pixel', status: 'insertion'},
    ]);
  });

  it('carries over deletions of untranslated text', () => {
    const result = carryOverSourceEdits(
      '© Google LLC',
      '© Google',
      '© Google LLC'
    );
    expect(result.text).toBe('© Google');
  });

  it('skips changes when only some occurrences changed', () => {
    const result = carryOverSourceEdits(
      'Since 2025, through 2025',
      'Since 2025, through 2026',
      'Desde 2025, hasta 2025'
    );
    expect(result.text).toBe('Desde 2025, hasta 2025');
    expect(result.changes[0].status).toBe('ambiguous');
  });

  it('skips changes that appear more often in the translation', () => {
    const result = carryOverSourceEdits(
      'Pixel 9',
      'Pixel 10',
      'Pixel 9 (Pixel 9)'
    );
    expect(result.text).toBe('Pixel 9 (Pixel 9)');
    expect(result.changes[0].status).toBe('ambiguous');
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
  it('copies the translation as-is by default', () => {
    const result = portTranslation({
      oldSource: 'Hello world',
      newSource: 'Hello, world!',
      translation: 'Hola mundo',
    });
    expect(result).toEqual({text: 'Hola mundo', changes: [], ruleCounts: []});
  });

  it('carries over edits then applies rules in order', () => {
    const result = portTranslation({
      oldSource: 'Get Pixel 9 in 2025',
      newSource: 'Get Pixel 10 in 2026',
      translation: 'Hol dir Pixel 9 in 2025',
      carryOverSourceEdits: true,
      rules: [
        {find: 'Hol dir', replace: 'Kaufe'},
        {find: 'Kaufe', replace: 'Kauf'},
      ],
    });
    expect(result.text).toBe('Kauf Pixel 10 in 2026');
    expect(result.ruleCounts).toEqual([1, 1]);
    expect(result.changes.map((c) => c.status)).toEqual(['applied', 'applied']);
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
