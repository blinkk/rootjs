import type {GlobalSearchHit} from '../../hooks/useGlobalSearch.js';

const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 120;

export type SnippetSegment = {kind: 'text' | 'mark'; value: string};

/**
 * Returns a sequence of plain / highlighted segments for a search hit.
 *
 * The window is centered on the first occurrence of any matched term; every
 * occurrence of every term that falls within the window is wrapped in a
 * `mark` segment so users can see all the matches at a glance. When no term
 * matches the indexed text (e.g. a fuzzy hit on the field label), returns
 * the leading slice of the text as a single plain segment.
 */
export function buildSnippet(hit: GlobalSearchHit): SnippetSegment[] {
  const text = hit.text || '';
  const terms = (hit.terms || []).filter(Boolean);
  if (!text) {
    return [];
  }
  if (!terms.length) {
    return [
      {kind: 'text', value: text.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER)},
    ];
  }

  const lower = text.toLowerCase();
  const matches: {start: number; end: number}[] = [];
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    if (!lowerTerm) {
      continue;
    }
    let idx = 0;
    while ((idx = lower.indexOf(lowerTerm, idx)) !== -1) {
      matches.push({start: idx, end: idx + lowerTerm.length});
      idx += lowerTerm.length;
    }
  }
  if (matches.length === 0) {
    return [
      {kind: 'text', value: text.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER)},
    ];
  }

  // Merge overlapping ranges so an inner term doesn't split an outer one
  // (e.g. searching `home` + `homepage` against the word `homepage`).
  matches.sort((a, b) => a.start - b.start);
  const merged: {start: number; end: number}[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({...m});
    }
  }

  // Window around the first match.
  const first = merged[0];
  const start = Math.max(0, first.start - SNIPPET_BEFORE);
  const end = Math.min(text.length, first.end + SNIPPET_AFTER);

  const segments: SnippetSegment[] = [];
  if (start > 0) {
    segments.push({kind: 'text', value: '… '});
  }
  let cursor = start;
  for (const m of merged) {
    if (m.end <= start || m.start >= end) {
      continue;
    }
    const matchStart = Math.max(m.start, start);
    const matchEnd = Math.min(m.end, end);
    if (matchStart > cursor) {
      segments.push({kind: 'text', value: text.slice(cursor, matchStart)});
    }
    segments.push({kind: 'mark', value: text.slice(matchStart, matchEnd)});
    cursor = matchEnd;
  }
  if (cursor < end) {
    segments.push({kind: 'text', value: text.slice(cursor, end)});
  }
  if (end < text.length) {
    segments.push({kind: 'text', value: ' …'});
  }
  return segments;
}
