import {ADJECTIVES, NOUNS} from './auto-slug-words.js';
import {normalizeSlug} from './slug.js';

const RANDOM_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const DEFAULT_DATE_FORMAT = 'YYYYMMDD';

export interface RenderAutoSlugOptions {
  /** Override the current time. Useful for tests. */
  now?: Date;
  /** Override the random source. Useful for tests. */
  random?: () => number;
}

/**
 * Renders an `autoSlug` template into a slug string.
 *
 * See `Collection.autoSlug` in `core/schema.ts` for the supported token
 * syntax. Unknown tokens are left untouched (`{foo}`) so authors notice
 * typos via the standard slug validation error.
 */
export function renderAutoSlug(
  template: string,
  opts?: RenderAutoSlugOptions
): string {
  const now = opts?.now ?? new Date();
  const random = opts?.random ?? Math.random;
  const rendered = template.replace(
    /\{([^{}]+?)\}/g,
    (match: string, raw: string) => {
      const [token, arg] = splitToken(raw);
      switch (token) {
        case 'date':
          return formatDate(now, arg || DEFAULT_DATE_FORMAT);
        case 'adjective':
          return pickRandom(ADJECTIVES, random);
        case 'noun':
          return pickRandom(NOUNS, random);
        case 'random':
          return randomString(parseLength(arg, 6), random);
        default:
          return match;
      }
    }
  );
  return normalizeSlug(rendered.toLowerCase());
}

function splitToken(raw: string): [string, string | undefined] {
  const idx = raw.indexOf(':');
  if (idx === -1) {
    return [raw.trim(), undefined];
  }
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1)];
}

function parseLength(arg: string | undefined, fallback: number): number {
  if (!arg) {
    return fallback;
  }
  const n = parseInt(arg, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function randomString(len: number, random: () => number): string {
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    chars.push(RANDOM_CHARS.charAt(Math.floor(random() * RANDOM_CHARS.length)));
  }
  return chars.join('');
}

function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MM: pad2(date.getMonth() + 1),
    DD: pad2(date.getDate()),
    HH: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds()),
  };
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (m) => tokens[m] ?? m);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
