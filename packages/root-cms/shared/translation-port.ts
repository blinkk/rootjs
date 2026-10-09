/**
 * Utilities for porting translations from one source string to another, e.g.
 * when a source string is edited slightly (typo fix, year bump, product
 * rename) and its existing translations would otherwise be lost because the
 * edited string hashes to a new key.
 *
 * Usage:
 * ```
 * const result = portTranslation({
 *   oldSource: '© 2025 Google',
 *   newSource: '© 2026 Google',
 *   translation: '© 2025 Google. Alle Rechte vorbehalten.',
 *   carryOverSourceEdits: true,
 *   rules: [{find: 'Alle', replace: 'Sämtliche'}],
 * });
 * // result.text => '© 2026 Google. Sämtliche Rechte vorbehalten.'
 * ```
 */

/** A single token-level diff operation. */
export interface DiffOp {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/** A contiguous change between an old and new source string. */
export interface SourceHunk {
  /** Text removed from the old source (empty for pure insertions). */
  oldText: string;
  /** Text added in the new source (empty for pure deletions). */
  newText: string;
}

/**
 * Outcome of carrying a source change over to a translation:
 * - `applied`: the old text was found in the translation and replaced.
 * - `not-found`: the old text doesn't appear in the translation (i.e. it was
 *   translated), so the change has to be made manually.
 * - `ambiguous`: the old text appears in the translation more often than in
 *   the source, or maps to different replacements, so it was left as-is.
 * - `insertion`: new text was added to the source, which can't be carried
 *   over automatically.
 */
export type CarryOverStatus =
  'applied' | 'not-found' | 'ambiguous' | 'insertion';

export interface CarryOverChange extends SourceHunk {
  status: CarryOverStatus;
}

export interface CarryOverResult {
  text: string;
  changes: CarryOverChange[];
}

/** A find/replace rule applied to translations when porting. */
export interface ReplaceRule {
  /** The text (or regex pattern) to find. */
  find: string;
  /** The replacement. For regex rules, `$1` etc. refer to capture groups. */
  replace: string;
  /** Whether `find` is a regular expression. */
  regex?: boolean;
  /** Whether matching is case-sensitive. Defaults to `false`. */
  caseSensitive?: boolean;
}

export interface ReplaceRuleResult {
  text: string;
  /** Number of replacements made. */
  count: number;
  /** Error message if the rule is invalid (e.g. a malformed regex). */
  error?: string;
}

export interface PortTranslationOptions {
  /** The source string the translation was made for. */
  oldSource: string;
  /** The source string the translation is being ported to. */
  newSource: string;
  /** The existing translation of `oldSource`. */
  translation: string;
  /** Whether to apply the old -> new source edits to the translation. */
  carryOverSourceEdits?: boolean;
  /** Find/replace rules, applied in order after carrying over edits. */
  rules?: ReplaceRule[];
}

export interface PortTranslationResult {
  text: string;
  /** Source changes and whether each was carried over. */
  changes: CarryOverChange[];
  /** Number of replacements made by each rule, in order. */
  ruleCounts: number[];
}

/**
 * Classification of the difference between two source strings:
 * - `same`: identical after normalization.
 * - `minor`: differs only in case, whitespace, punctuation or quote style,
 *   so copying the translations as-is is usually fine.
 * - `edit`: the wording changed.
 */
export type SourceChangeType = 'same' | 'minor' | 'edit';

/**
 * Max number of DP cells computed when diffing two token lists. Larger diffs
 * fall back to treating the differing middle section as a single change.
 */
const MAX_DIFF_CELLS = 1_000_000;

const TOKEN_RE = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

/**
 * Splits a string into word, whitespace and single punctuation tokens.
 */
export function tokenize(str: string): string[] {
  return String(str || '').match(TOKEN_RE) || [];
}

/**
 * Computes a token-level diff between two strings.
 */
export function diffStrings(a: string, b: string): DiffOp[] {
  const ops = diffTokens(tokenize(a), tokenize(b));
  return mergeOps(ops);
}

function diffTokens(a: string[], b: string[]): DiffOp[] {
  // Trim the common prefix and suffix, which keeps the DP table small for the
  // common case of a small edit within a long string.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const prefix: DiffOp[] = a
    .slice(0, start)
    .map((text) => ({type: 'equal', text}));
  const suffix: DiffOp[] = a.slice(endA).map((text) => ({type: 'equal', text}));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let middle: DiffOp[];
  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    middle = [
      ...midA.map((text): DiffOp => ({type: 'delete', text})),
      ...midB.map((text): DiffOp => ({type: 'insert', text})),
    ];
  } else {
    middle = lcsDiff(midA, midB);
  }
  return [...prefix, ...middle, ...suffix];
}

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // lengths[i][j] is the LCS length of a[i:] and b[j:].
  const lengths: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) {
    lengths.push(new Uint32Array(m + 1));
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({type: 'equal', text: a[i]});
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      ops.push({type: 'delete', text: a[i]});
      i++;
    } else {
      ops.push({type: 'insert', text: b[j]});
      j++;
    }
  }
  while (i < n) {
    ops.push({type: 'delete', text: a[i++]});
  }
  while (j < m) {
    ops.push({type: 'insert', text: b[j++]});
  }
  return ops;
}

function mergeOps(ops: DiffOp[]): DiffOp[] {
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      merged.push({...op});
    }
  }
  return merged;
}

/**
 * Returns the contiguous changes between an old and new source string.
 */
export function getSourceHunks(
  oldSource: string,
  newSource: string
): SourceHunk[] {
  const hunks: SourceHunk[] = [];
  let current: SourceHunk | null = null;
  for (const op of diffStrings(oldSource, newSource)) {
    if (op.type === 'equal') {
      current = null;
      continue;
    }
    if (!current) {
      current = {oldText: '', newText: ''};
      hunks.push(current);
    }
    if (op.type === 'delete') {
      current.oldText += op.text;
    } else {
      current.newText += op.text;
    }
  }
  return hunks;
}

/**
 * Applies the edits between `oldSource` and `newSource` to a translation of
 * `oldSource`, for changed text that appears verbatim in the translation
 * (e.g. numbers, years, URLs, placeholders and product names, which usually
 * aren't translated).
 */
export function carryOverSourceEdits(
  oldSource: string,
  newSource: string,
  translation: string
): CarryOverResult {
  const hunks = getSourceHunks(oldSource, newSource);

  // Group the hunks by old text so repeated changes (e.g. "2025" -> "2026"
  // in two places) are treated as one, and conflicting ones are detected.
  const replacements = new Map<
    string,
    {newTexts: Set<string>; changedCount: number}
  >();
  for (const hunk of hunks) {
    const oldText = hunk.oldText.trim() ? hunk.oldText : '';
    if (!oldText) {
      continue;
    }
    if (!replacements.has(oldText)) {
      replacements.set(oldText, {newTexts: new Set(), changedCount: 0});
    }
    const entry = replacements.get(oldText)!;
    entry.newTexts.add(hunk.newText);
    entry.changedCount++;
  }

  const statuses = new Map<string, CarryOverStatus>();
  const matches: Array<{start: number; end: number; replacement: string}> = [];
  for (const [oldText, {newTexts, changedCount}] of replacements) {
    const translationMatches = findBoundedMatches(translation, oldText);
    if (translationMatches.length === 0) {
      statuses.set(oldText, 'not-found');
      continue;
    }
    // The change is ambiguous if it maps to different replacements, if only
    // some of the occurrences in the source changed (it's unknown which
    // occurrences in the translation correspond to them), or if the text
    // appears in the translation more often than in the source.
    const sourceCount = findBoundedMatches(oldSource, oldText).length;
    if (
      newTexts.size > 1 ||
      changedCount < sourceCount ||
      translationMatches.length > sourceCount
    ) {
      statuses.set(oldText, 'ambiguous');
      continue;
    }
    const replacement = Array.from(newTexts)[0];
    statuses.set(oldText, 'applied');
    for (const start of translationMatches) {
      matches.push({start, end: start + oldText.length, replacement});
    }
  }

  // Apply all replacements against the original translation at once, so a
  // replacement's output is never matched by another change.
  matches.sort((a, b) => a.start - b.start);
  let text = '';
  let pos = 0;
  for (const match of matches) {
    if (match.start < pos) {
      continue;
    }
    text += translation.slice(pos, match.start) + match.replacement;
    pos = match.end;
  }
  text += translation.slice(pos);

  const changes: CarryOverChange[] = hunks
    .filter((hunk) => hunk.oldText.trim() || hunk.newText.trim())
    .map((hunk) => ({
      ...hunk,
      status: hunk.oldText.trim()
        ? statuses.get(hunk.oldText) || 'not-found'
        : 'insertion',
    }));
  return {text, changes};
}

/**
 * Returns the start indexes of `needle` in `haystack`, skipping matches that
 * are part of a larger word (e.g. "9" within "1999").
 */
function findBoundedMatches(haystack: string, needle: string): number[] {
  const results: number[] = [];
  if (!needle) {
    return results;
  }
  const checkStart = WORD_CHAR_RE.test(needle[0]);
  const checkEnd = WORD_CHAR_RE.test(needle[needle.length - 1]);
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    const boundedStart = !checkStart || !before || !WORD_CHAR_RE.test(before);
    const boundedEnd = !checkEnd || !after || !WORD_CHAR_RE.test(after);
    if (boundedStart && boundedEnd) {
      results.push(index);
      index = haystack.indexOf(needle, index + needle.length);
    } else {
      index = haystack.indexOf(needle, index + 1);
    }
  }
  return results;
}

/**
 * Applies a find/replace rule to a string.
 */
export function applyReplaceRule(
  text: string,
  rule: ReplaceRule
): ReplaceRuleResult {
  if (!rule.find) {
    return {text, count: 0};
  }
  const flags = rule.caseSensitive ? 'g' : 'gi';
  let re: RegExp;
  try {
    re = new RegExp(rule.regex ? rule.find : escapeRegExp(rule.find), flags);
  } catch (err) {
    return {text, count: 0, error: String((err as Error)?.message || err)};
  }
  let count = 0;
  const result = text.replace(re, (...args) => {
    count++;
    if (!rule.regex) {
      // Literal rules insert the replacement as-is (no `$` substitutions).
      return rule.replace;
    }
    return expandReplacement(rule.replace, args);
  });
  return {text: result, count};
}

/**
 * Expands `$&`, `$1`..`$99` and `$$` in a regex replacement string, given the
 * args passed to a `String.prototype.replace()` callback.
 */
function expandReplacement(replacement: string, args: any[]): string {
  // The args are: match, ...groups, offset, input[, namedGroups].
  const hasNamedGroups = typeof args[args.length - 1] === 'object';
  const groups = args.slice(1, hasNamedGroups ? -3 : -2) as Array<
    string | undefined
  >;
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (token, key) => {
    if (key === '$') {
      return '$';
    }
    if (key === '&') {
      return args[0];
    }
    const index = Number(key);
    if (index >= 1 && index <= groups.length) {
      return groups[index - 1] ?? '';
    }
    return token;
  });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ports a translation from an old source string to a new one, optionally
 * carrying over the source edits and applying find/replace rules.
 */
export function portTranslation(
  options: PortTranslationOptions
): PortTranslationResult {
  let text = options.translation || '';
  let changes: CarryOverChange[] = [];
  if (options.carryOverSourceEdits) {
    const result = carryOverSourceEdits(
      options.oldSource,
      options.newSource,
      text
    );
    text = result.text;
    changes = result.changes;
  }
  const ruleCounts: number[] = [];
  for (const rule of options.rules || []) {
    const result = applyReplaceRule(text, rule);
    text = result.text;
    ruleCounts.push(result.count);
  }
  return {text, changes, ruleCounts};
}

/**
 * Classifies the difference between two source strings.
 */
export function classifySourceChange(
  oldSource: string,
  newSource: string
): SourceChangeType {
  if (normalizeWhitespace(oldSource) === normalizeWhitespace(newSource)) {
    return 'same';
  }
  if (toCanonicalWords(oldSource) === toCanonicalWords(newSource)) {
    return 'minor';
  }
  return 'edit';
}

function normalizeWhitespace(str: string): string {
  return String(str || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCanonicalWords(str: string): string {
  return tokenize(str.toLowerCase())
    .filter((token) => WORD_CHAR_RE.test(token[0]))
    .join(' ');
}

/**
 * Returns a similarity score between 0 and 1 for two strings, based on the
 * number of words they have in common (in order).
 */
export function similarity(a: string, b: string): number {
  const wordsA = toCanonicalWords(a).split(' ').filter(Boolean);
  const wordsB = toCanonicalWords(b).split(' ').filter(Boolean);
  if (wordsA.length === 0 && wordsB.length === 0) {
    return normalizeWhitespace(a) === normalizeWhitespace(b) ? 1 : 0;
  }
  const ops = diffTokens(wordsA, wordsB);
  const common = ops.filter((op) => op.type === 'equal').length;
  return (2 * common) / (wordsA.length + wordsB.length);
}

/**
 * Sorts candidate source strings by similarity to a target string, most
 * similar first.
 */
export function rankBySimilarity<T extends {source: string}>(
  target: string,
  candidates: T[]
): Array<T & {score: number}> {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: similarity(target, candidate.source),
    }))
    .sort((a, b) => b.score - a.score);
}

const PLACEHOLDER_RE =
  /\{\{\s*[^{}\s]+\s*\}\}|\{[A-Za-z0-9_.$-]+\}|%(?:\d+\$)?[sdif@]/g;

/**
 * Returns the placeholder tokens (e.g. `{count}`, `{{name}}`, `%s`) in a
 * string.
 */
export function extractPlaceholders(str: string): string[] {
  return String(str || '').match(PLACEHOLDER_RE) || [];
}

/**
 * Compares the placeholders in a source string and its translation, returning
 * the placeholders missing from the translation and any extra ones that
 * aren't in the source.
 */
export function findPlaceholderMismatches(
  source: string,
  translation: string
): {missing: string[]; extra: string[]} {
  const remaining = extractPlaceholders(translation);
  const missing: string[] = [];
  for (const token of extractPlaceholders(source)) {
    const index = remaining.indexOf(token);
    if (index === -1) {
      missing.push(token);
    } else {
      remaining.splice(index, 1);
    }
  }
  return {missing, extra: remaining};
}
