import {describe, expect, it} from 'vitest';
import {
  COMMON_ASPECT_RATIOS,
  flipAspectRatio,
  formatAspectRatio,
  formatDimensionsAspectRatio,
  normalizeAspectRatios,
  parseAspectRatio,
  testAnyAspectRatioMatches,
  testAspectRatioMatches,
} from './aspect-ratio.js';

describe('parseAspectRatio', () => {
  it('parses ratio strings', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9);
    expect(parseAspectRatio('4/3')).toBeCloseTo(4 / 3);
    expect(parseAspectRatio('1x1')).toBe(1);
    expect(parseAspectRatio(' 1200 : 630 ')).toBeCloseTo(1200 / 630);
    expect(parseAspectRatio('2.39:1')).toBeCloseTo(2.39);
  });

  it('accepts full dimensions', () => {
    expect(parseAspectRatio('1400:600')).toBeCloseTo(7 / 3);
    expect(parseAspectRatio('1400x600')).toBeCloseTo(7 / 3);
    expect(parseAspectRatio('1400 x 600')).toBeCloseTo(7 / 3);
    expect(testAspectRatioMatches(2800, 1200, '1400x600')).toBe(true);
    expect(testAspectRatioMatches(1600, 900, '1400x600')).toBe(false);
  });

  it('parses numbers', () => {
    expect(parseAspectRatio(1.5)).toBe(1.5);
    expect(parseAspectRatio('1.5')).toBe(1.5);
  });

  it('returns null for invalid values', () => {
    expect(parseAspectRatio('')).toBe(null);
    expect(parseAspectRatio('foo')).toBe(null);
    expect(parseAspectRatio('16:0')).toBe(null);
    expect(parseAspectRatio(0)).toBe(null);
    expect(parseAspectRatio(-1)).toBe(null);
    expect(parseAspectRatio(undefined)).toBe(null);
  });
});

describe('normalizeAspectRatios', () => {
  it('normalizes single values and lists', () => {
    expect(normalizeAspectRatios(undefined)).toEqual([]);
    expect(normalizeAspectRatios('16:9')).toEqual(['16:9']);
    expect(normalizeAspectRatios(['16:9', 'foo', 1])).toEqual(['16:9', 1]);
  });
});

describe('formatAspectRatio', () => {
  it('formats aspect ratios', () => {
    expect(formatAspectRatio('16:9')).toBe('16:9');
    expect(formatAspectRatio('16/9')).toBe('16:9');
    expect(formatAspectRatio('1400x600')).toBe('1400:600');
    expect(formatAspectRatio(1.5)).toBe('3:2');
    expect(formatAspectRatio(16 / 9)).toBe('16:9');
    expect(formatAspectRatio(1.85)).toBe('1.85:1');
  });
});

describe('formatDimensionsAspectRatio', () => {
  it('reduces dimensions to a ratio', () => {
    expect(formatDimensionsAspectRatio(1920, 1080)).toBe('16:9');
    expect(formatDimensionsAspectRatio(1000, 1000)).toBe('1:1');
    expect(formatDimensionsAspectRatio(1366, 768)).toBe('16:9');
    expect(formatDimensionsAspectRatio(1200, 630)).toBe('1.9:1');
    expect(formatDimensionsAspectRatio(0, 100)).toBe('');
  });
});

describe('formatDimensionsAspectRatio with known ratios', () => {
  it('prefers a matching known ratio as written', () => {
    expect(formatDimensionsAspectRatio(2800, 1200, ['1400:600'])).toBe(
      '1400:600'
    );
    expect(formatDimensionsAspectRatio(1600, 686, ['1400x600'])).toBe(
      '1400:600'
    );
    expect(formatDimensionsAspectRatio(1000, 563)).toBe('1.78:1');
    expect(formatDimensionsAspectRatio(1000, 563, COMMON_ASPECT_RATIOS)).toBe(
      '16:9'
    );
  });

  it('matches known ratios in either orientation', () => {
    expect(formatDimensionsAspectRatio(563, 1000, COMMON_ASPECT_RATIOS)).toBe(
      '9:16'
    );
    expect(formatDimensionsAspectRatio(600, 1400, ['1400:600'])).toBe(
      '600:1400'
    );
  });

  it('falls back when nothing matches', () => {
    expect(formatDimensionsAspectRatio(1200, 630, COMMON_ASPECT_RATIOS)).toBe(
      '1.9:1'
    );
  });
});

describe('flipAspectRatio', () => {
  it('flips ratio strings and numbers', () => {
    expect(flipAspectRatio('16:9')).toBe('9:16');
    expect(flipAspectRatio('1400x600')).toBe('600:1400');
    expect(flipAspectRatio(2)).toBe(0.5);
  });
});

describe('testAspectRatioMatches', () => {
  it('matches within the tolerance', () => {
    expect(testAspectRatioMatches(1920, 1080, '16:9')).toBe(true);
    expect(testAspectRatioMatches(1366, 768, '16:9')).toBe(true);
    expect(testAspectRatioMatches(1600, 1200, '16:9')).toBe(false);
    expect(testAspectRatioMatches(1080, 1920, '16:9')).toBe(false);
    expect(testAspectRatioMatches(1080, 1920, '9:16')).toBe(true);
  });

  it('matches any of a list of aspect ratios', () => {
    expect(testAnyAspectRatioMatches(1600, 1200, ['16:9', '4:3'])).toBe(true);
    expect(testAnyAspectRatioMatches(1000, 1000, ['16:9', '4:3'])).toBe(false);
    expect(testAnyAspectRatioMatches(1000, 1000, [])).toBe(true);
  });
});
