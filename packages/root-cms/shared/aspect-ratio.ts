/**
 * An aspect ratio, expressed either as a string like `'16:9'`, `'16/9'` or
 * `'16x9'`, or as a number like `1.7778` (width divided by height).
 */
export type AspectRatio = string | number;

/**
 * The relative tolerance used when comparing aspect ratios, to account for
 * rounding when images are resized or cropped (e.g. `1366x768` is considered
 * 16:9).
 */
export const ASPECT_RATIO_TOLERANCE = 0.01;

/** Matches ratio strings like `16:9`, `16/9` or `1400x600`. */
const RATIO_PATTERN = /^(\d*\.?\d+)\s*[:/xX×]\s*(\d*\.?\d+)$/;

/**
 * Parses an aspect ratio into a number (width divided by height). Returns
 * `null` if the value can't be parsed.
 */
export function parseAspectRatio(
  value: AspectRatio | null | undefined
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const str = value.trim();
  const match = str.match(RATIO_PATTERN);
  if (match) {
    const width = parseFloat(match[1]);
    const height = parseFloat(match[2]);
    if (width > 0 && height > 0) {
      return width / height;
    }
    return null;
  }
  const num = Number(str);
  if (str && Number.isFinite(num) && num > 0) {
    return num;
  }
  return null;
}

/**
 * Normalizes a single aspect ratio or a list of aspect ratios into a list of
 * valid aspect ratios, dropping any values that can't be parsed.
 */
export function normalizeAspectRatios(
  value: AspectRatio | AspectRatio[] | null | undefined
): AspectRatio[] {
  if (value === null || value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.filter((v) => parseAspectRatio(v) !== null);
}

/**
 * Formats an aspect ratio for display, e.g. `'16:9'`. Numeric values are
 * converted to a `w:h` ratio when a simple one exists, otherwise they're
 * formatted as `1.85:1`.
 */
export function formatAspectRatio(value: AspectRatio): string {
  if (typeof value === 'string') {
    const match = value.trim().match(RATIO_PATTERN);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  const ratio = parseAspectRatio(value);
  if (ratio === null) {
    return String(value);
  }
  return formatRatioNumber(ratio);
}

/**
 * Common aspect ratios offered as presets in the image editor, and used to
 * label dimensions that are close to one of them.
 */
export const COMMON_ASPECT_RATIOS: string[] = [
  '1:1',
  '16:9',
  '4:3',
  '3:2',
  '5:4',
];

/**
 * Flips an aspect ratio between landscape and portrait, e.g. `'16:9'` becomes
 * `'9:16'`.
 */
export function flipAspectRatio(value: AspectRatio): AspectRatio {
  if (typeof value === 'string') {
    const match = value.trim().match(RATIO_PATTERN);
    if (match) {
      return `${match[2]}:${match[1]}`;
    }
  }
  const ratio = parseAspectRatio(value);
  return ratio ? 1 / ratio : value;
}

/**
 * Formats the aspect ratio of a width and height for display, e.g. `1920x1080`
 * becomes `'16:9'`.
 *
 * When `knownRatios` is provided and the dimensions match one of them (in
 * either orientation), that ratio is used as written. For example, `2800x1200`
 * with `['1400:600']` becomes `'1400:600'` instead of `'7:3'`, and
 * `1000x563` with `['16:9']` becomes `'16:9'` instead of `'1.78:1'`.
 */
export function formatDimensionsAspectRatio(
  width: number,
  height: number,
  knownRatios: AspectRatio[] = []
): string {
  if (!(width > 0 && height > 0)) {
    return '';
  }
  for (const known of normalizeAspectRatios(knownRatios)) {
    if (testAspectRatioMatches(width, height, known)) {
      return formatAspectRatio(known);
    }
    const flipped = flipAspectRatio(known);
    if (testAspectRatioMatches(width, height, flipped)) {
      return formatAspectRatio(flipped);
    }
  }
  if (Number.isInteger(width) && Number.isInteger(height)) {
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;
    if (w <= 32 && h <= 32) {
      return `${w}:${h}`;
    }
  }
  return formatRatioNumber(width / height);
}

/**
 * Returns whether the given dimensions match an aspect ratio, within the
 * relative `tolerance`.
 */
export function testAspectRatioMatches(
  width: number,
  height: number,
  aspectRatio: AspectRatio,
  tolerance = ASPECT_RATIO_TOLERANCE
): boolean {
  const expected = parseAspectRatio(aspectRatio);
  if (expected === null || !(width > 0 && height > 0)) {
    return true;
  }
  const actual = width / height;
  return Math.abs(actual / expected - 1) <= tolerance;
}

/**
 * Returns whether the given dimensions match any of the aspect ratios. Returns
 * `true` if no valid aspect ratios are provided.
 */
export function testAnyAspectRatioMatches(
  width: number,
  height: number,
  aspectRatios: AspectRatio[]
): boolean {
  const valid = normalizeAspectRatios(aspectRatios);
  if (valid.length === 0) {
    return true;
  }
  return valid.some((ratio) => testAspectRatioMatches(width, height, ratio));
}

/** Formats a ratio number, preferring a simple `w:h` form when one exists. */
function formatRatioNumber(ratio: number): string {
  for (let h = 1; h <= 32; h++) {
    const w = ratio * h;
    const rounded = Math.round(w);
    if (rounded > 0 && rounded <= 32 && Math.abs(w - rounded) < 0.01) {
      return `${rounded}:${h}`;
    }
  }
  return `${Number(ratio.toFixed(2))}:1`;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
