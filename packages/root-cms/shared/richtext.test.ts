import {describe, expect, test} from 'vitest';
import {
  getRichTextParagraphFontSizes,
  normalizeRichTextParagraphSizes,
  parseRichTextParagraphSize,
} from './richtext.js';

describe('parseRichTextParagraphSize', () => {
  test('accepts any non-empty string', () => {
    expect(parseRichTextParagraphSize('small')).toBe('small');
    expect(parseRichTextParagraphSize('body-3')).toBe('body-3');
    expect(parseRichTextParagraphSize('  large  ')).toBe('large');
  });

  test('rejects missing and non-string values', () => {
    expect(parseRichTextParagraphSize(undefined)).toBe(undefined);
    expect(parseRichTextParagraphSize(null)).toBe(undefined);
    expect(parseRichTextParagraphSize('')).toBe(undefined);
    expect(parseRichTextParagraphSize('   ')).toBe(undefined);
    expect(parseRichTextParagraphSize(2)).toBe(undefined);
    expect(parseRichTextParagraphSize({value: 'small'})).toBe(undefined);
  });
});

describe('normalizeRichTextParagraphSizes', () => {
  test('defaults labels to the size value', () => {
    expect(normalizeRichTextParagraphSizes(['small', 'large'])).toEqual([
      {value: 'small', label: 'small'},
      {value: 'large', label: 'large'},
    ]);
  });

  test('carries an explicit font size and omits a blank one', () => {
    expect(
      normalizeRichTextParagraphSizes([
        {value: 'tiny', label: 'Tiny', fontSize: '  0.75em '},
        {value: 'huge', fontSize: '   '},
      ])
    ).toEqual([
      {value: 'tiny', label: 'Tiny', fontSize: '0.75em'},
      {value: 'huge', label: 'huge'},
    ]);
  });

  test('preserves explicit labels and declaration order', () => {
    expect(
      normalizeRichTextParagraphSizes([
        {value: 'large', label: 'Larger'},
        'small',
      ])
    ).toEqual([
      {value: 'large', label: 'Larger'},
      {value: 'small', label: 'small'},
    ]);
  });

  test('drops entries without a usable value', () => {
    expect(
      normalizeRichTextParagraphSizes([
        'small',
        '',
        {value: '  '},
        {label: 'No value'} as any,
      ])
    ).toEqual([{value: 'small', label: 'small'}]);
  });

  test('returns an empty list when the option is omitted', () => {
    expect(normalizeRichTextParagraphSizes()).toEqual([]);
    expect(normalizeRichTextParagraphSizes(null)).toEqual([]);
  });
});

describe('getRichTextParagraphFontSizes', () => {
  test('maps only the sizes that declared a font size', () => {
    expect(
      getRichTextParagraphFontSizes([
        {value: 'tiny', label: 'Tiny', fontSize: '0.75em'},
        {value: 'huge', label: 'Huge'},
        'small',
      ])
    ).toEqual({tiny: '0.75em'});
  });

  test('is empty when the option is omitted', () => {
    expect(getRichTextParagraphFontSizes()).toEqual({});
  });
});
