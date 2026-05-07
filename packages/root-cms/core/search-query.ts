/**
 * Google-style query parsing and execution for the CMS search index.
 *
 * The CMS spotlight passes raw user input straight through to MiniSearch, which
 * means quotes, leading dashes, and multiple words all get tokenized the same
 * way (fuzzy + prefix on every term, OR-combined). That produces noisy results
 * — typing `homepage hero` returns every doc containing `homepage` *or* a
 * fuzzy/prefix match for `hero`.
 *
 * This module preprocesses the query string into structured parts and runs
 * each part with the appropriate MiniSearch options:
 *
 *   - `"exact phrase"`  — must appear verbatim (token-aligned) in the doc;
 *                         fuzzy + prefix disabled.
 *   - `bare term`       — fuzzy + prefix allowed (existing behavior).
 *   - `-foo` / `-"x y"` — must NOT appear in matching docs.
 *
 * Multiple parts are AND-combined so adding more terms narrows results, just
 * like Google.
 */

import MiniSearch, {SearchResult} from 'minisearch';

/** Structured form of a user query string. */
export interface ParsedQuery {
  /** Quoted phrases that must appear verbatim (token-aligned). */
  phrases: string[];
  /** Free-form terms; fuzzy + prefix matching applies. */
  terms: string[];
  /** Bare terms that must NOT appear in matching docs. */
  excluded: string[];
  /** Quoted phrases that must NOT appear in matching docs. */
  excludedPhrases: string[];
}

/**
 * Curly / typographic quote characters that browsers (especially iOS / macOS
 * with "smart quotes" enabled) substitute for plain `"`. We normalize them so
 * users don't get confused when their pasted query stops working.
 */
const SMART_QUOTES = /[“”„«»]/g;

/**
 * Splits a Google-style query string into phrases / terms / exclusions.
 *
 * Examples:
 *   `foo "bar baz" -qux`   ->  terms=[foo], phrases=[bar baz], excluded=[qux]
 *   `"exact phrase only"`  ->  phrases=[exact phrase only]
 *   `-"forbidden phrase"`  ->  excludedPhrases=[forbidden phrase]
 *
 * Notes:
 *   - Smart quotes (U+201C / U+201D / etc.) are normalized to straight `"`.
 *   - An unclosed quote is treated as if closed at end-of-input (matches
 *     Google's behavior — the rest of the query becomes a single phrase).
 *   - Empty or whitespace-only quotes (`""`, `"  "`) are skipped.
 *   - A leading `-` only marks exclusion when followed by a non-whitespace
 *     character; standalone `-` is dropped.
 */
export function parseQuery(input: string): ParsedQuery {
  const out: ParsedQuery = {
    phrases: [],
    terms: [],
    excluded: [],
    excludedPhrases: [],
  };
  if (!input) {
    return out;
  }
  const s = input.replace(SMART_QUOTES, '"');
  let i = 0;
  while (i < s.length) {
    while (i < s.length && isSpace(s[i])) {
      i++;
    }
    if (i >= s.length) {
      break;
    }
    let negative = false;
    if (s[i] === '-' && i + 1 < s.length && !isSpace(s[i + 1])) {
      negative = true;
      i++;
    }
    if (s[i] === '"') {
      i++;
      const start = i;
      while (i < s.length && s[i] !== '"') {
        i++;
      }
      const phrase = s.slice(start, i).trim();
      if (i < s.length) {
        i++;
      }
      if (phrase) {
        if (negative) {
          out.excludedPhrases.push(phrase);
        } else {
          out.phrases.push(phrase);
        }
      }
    } else {
      const start = i;
      while (i < s.length && !isSpace(s[i]) && s[i] !== '"') {
        i++;
      }
      const term = s.slice(start, i);
      // Skip tokens that are just dashes (e.g. an isolated `-` between words).
      if (term && term.replace(/^-+$/, '')) {
        if (negative) {
          out.excluded.push(term);
        } else {
          out.terms.push(term);
        }
      }
    }
  }
  return out;
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Splits text into lowercase word tokens, mirroring MiniSearch's default
 * tokenizer (whitespace + Unicode punctuation). Used for token-aligned phrase
 * matching so `"foo bar"` matches `foo. bar` but not `foobar`.
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(Boolean);
}

/**
 * Returns true if `phrase` appears in `text` as a contiguous run of word
 * tokens. Punctuation between tokens is ignored, but token boundaries are
 * required (so `foo bar` does NOT match `foobar`).
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0) {
    return true;
  }
  const textTokens = tokenize(text);
  if (textTokens.length < phraseTokens.length) {
    return false;
  }
  outer: for (let i = 0; i <= textTokens.length - phraseTokens.length; i++) {
    for (let j = 0; j < phraseTokens.length; j++) {
      if (textTokens[i + j] !== phraseTokens[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/** True if this parsed query carries no positive constraints. */
export function isEmptyQuery(parsed: ParsedQuery): boolean {
  return parsed.phrases.length === 0 && parsed.terms.length === 0;
}

/** Per-record accumulator while AND-combining results from multiple parts. */
interface AccEntry {
  /** Sum of MiniSearch scores across each constraint that matched. */
  score: number;
  /** The first record we saw for this id; storeFields are identical. */
  record: SearchResult;
  /** Union of MiniSearch `terms` arrays across constraints. */
  terms: Set<string>;
}

/**
 * Runs a parsed query against a MiniSearch index using Google-style semantics:
 *   - phrases match as exact contiguous word runs (no fuzzy / no prefix);
 *   - free terms keep the index's default fuzzy + prefix behavior;
 *   - all positive parts are AND-combined (a doc must satisfy each one);
 *   - excluded terms / phrases remove docs from the result.
 *
 * Per-record scores from each part are summed, so a doc that matches more
 * constraints ranks above one that matches fewer.
 */
export function executeQuery(
  index: MiniSearch,
  parsed: ParsedQuery
): SearchResult[] {
  if (isEmptyQuery(parsed)) {
    return [];
  }

  let acc: Map<string, AccEntry> | null = null;

  for (const phrase of parsed.phrases) {
    const candidates = index.search(phrase, {
      combineWith: 'AND',
      fuzzy: false,
      prefix: false,
    });
    const matched = candidates.filter(
      (r) =>
        containsPhrase(String((r as any).text || ''), phrase) ||
        containsPhrase(String((r as any).fieldLabel || ''), phrase)
    );
    acc = mergeAnd(acc, matched);
    if (acc.size === 0) {
      return [];
    }
  }

  if (parsed.terms.length > 0) {
    const q = parsed.terms.join(' ');
    const results = index.search(q, {combineWith: 'AND'});
    acc = mergeAnd(acc, results);
  }

  if (!acc || acc.size === 0) {
    return [];
  }

  for (const term of parsed.excluded) {
    for (const r of index.search(term)) {
      acc.delete(String(r.id));
    }
  }
  for (const phrase of parsed.excludedPhrases) {
    const candidates = index.search(phrase, {
      combineWith: 'AND',
      fuzzy: false,
      prefix: false,
    });
    for (const r of candidates) {
      if (
        containsPhrase(String((r as any).text || ''), phrase) ||
        containsPhrase(String((r as any).fieldLabel || ''), phrase)
      ) {
        acc.delete(String(r.id));
      }
    }
  }

  return Array.from(acc.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({
      ...entry.record,
      score: entry.score,
      terms: Array.from(entry.terms),
    }));
}

function mergeAnd(
  acc: Map<string, AccEntry> | null,
  results: SearchResult[]
): Map<string, AccEntry> {
  if (acc === null) {
    const next = new Map<string, AccEntry>();
    for (const r of results) {
      next.set(String(r.id), {
        score: r.score,
        record: r,
        terms: new Set<string>(Array.isArray(r.terms) ? r.terms : []),
      });
    }
    return next;
  }
  const byId = new Map<string, SearchResult>();
  for (const r of results) {
    byId.set(String(r.id), r);
  }
  const next = new Map<string, AccEntry>();
  for (const [id, entry] of acc) {
    const r = byId.get(id);
    if (!r) {
      continue;
    }
    const terms = new Set(entry.terms);
    if (Array.isArray(r.terms)) {
      for (const t of r.terms) {
        terms.add(t);
      }
    }
    next.set(id, {
      score: entry.score + r.score,
      record: entry.record,
      terms,
    });
  }
  return next;
}
