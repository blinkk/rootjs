import {useCallback, useMemo, useState} from 'preact/hooks';

export interface MentionItem {
  /** Slug inserted into the text (without the leading `@`). */
  value: string;
  /** Optional emoji or short label rendered before the value. */
  icon?: string;
  /** Optional longer description rendered as secondary text. */
  description?: string;
}

interface MentionState {
  /** True when the dropdown should be visible. */
  open: boolean;
  /** Current partial after the `@` (lowercased). */
  query: string;
  /** Caret position used to anchor the dropdown. */
  start: number;
  /** Caret end position. */
  end: number;
  /** Items filtered by `query`. */
  items: MentionItem[];
  /** Index of the currently-highlighted item. */
  index: number;
}

const CLOSED: MentionState = {
  open: false,
  query: '',
  start: 0,
  end: 0,
  items: [],
  index: 0,
};

/**
 * Drives a textarea-based `@`-mention typeahead. The hook returns the current
 * state, an input handler to wire to the textarea's `onInput`, and a key
 * handler to wire to its `onKeyDown` so arrow keys / Enter / Escape behave
 * correctly when the dropdown is open.
 *
 * Designed for plain `<textarea>` and `<input>` elements. For Lexical-based
 * editors use the typeahead plugin in `LexicalEditor` instead.
 */
export function useMentionAutocomplete(options: {
  items: MentionItem[];
  /** Called when the user accepts an item; receives the chosen item and the
   * range to replace. The caller updates the textarea value. */
  onAccept: (item: MentionItem, range: {start: number; end: number}) => void;
}) {
  const [state, setState] = useState<MentionState>(CLOSED);

  const close = useCallback(() => setState(CLOSED), []);

  const handleInput = useCallback(
    (e: Event & {currentTarget: HTMLTextAreaElement | HTMLInputElement}) => {
      const el = e.currentTarget;
      const caret = el.selectionStart ?? 0;
      const text = el.value;
      const range = findMentionRange(text, caret);
      if (!range) {
        setState(CLOSED);
        return;
      }
      const query = text.slice(range.start + 1, range.end).toLowerCase();
      const filtered = filterItems(options.items, query);
      if (filtered.length === 0) {
        setState(CLOSED);
        return;
      }
      setState({
        open: true,
        query,
        start: range.start,
        end: range.end,
        items: filtered,
        index: 0,
      });
    },
    [options.items]
  );

  const accept = useCallback(
    (item: MentionItem) => {
      options.onAccept(item, {start: state.start, end: state.end});
      setState(CLOSED);
    },
    [options, state.start, state.end]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!state.open) {
        return false;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setState((s) => ({...s, index: (s.index + 1) % s.items.length}));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState((s) => ({
          ...s,
          index: (s.index - 1 + s.items.length) % s.items.length,
        }));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const item = state.items[state.index];
        if (item) {
          e.preventDefault();
          accept(item);
          return true;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setState(CLOSED);
        return true;
      }
      return false;
    },
    [state, accept]
  );

  const visibleItems = useMemo(() => state.items, [state.items]);

  return {
    state,
    handleInput,
    handleKeyDown,
    accept,
    close,
    visibleItems,
  };
}

/**
 * Returns the @-mention range surrounding `caret`, or null if none. A valid
 * mention starts with `@` at a word boundary and contains only slug-allowed
 * characters up to the caret.
 */
export function findMentionRange(
  text: string,
  caret: number
): {start: number; end: number} | null {
  // Walk back from the caret looking for `@`. Stop on whitespace or another
  // `@` (which would mean the user typed an email-like token).
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i > 0 ? text[i - 1] : '';
      if (i === 0 || /\s/.test(before)) {
        // The chars between @ and caret must be slug-shaped.
        const partial = text.slice(i + 1, caret);
        if (partial === '' || /^[a-z0-9-]*$/.test(partial)) {
          return {start: i, end: caret};
        }
      }
      return null;
    }
    if (/\s/.test(ch)) {
      return null;
    }
    i--;
  }
  return null;
}

function filterItems(items: MentionItem[], query: string): MentionItem[] {
  if (!query) {
    return items;
  }
  return items.filter((item) => item.value.toLowerCase().startsWith(query));
}

/**
 * Replaces a mention range in `text` with the chosen value plus a trailing
 * space. Returns the new text and the new caret position.
 */
export function replaceMentionRange(
  text: string,
  range: {start: number; end: number},
  value: string
): {text: string; caret: number} {
  const before = text.slice(0, range.start);
  const after = text.slice(range.end);
  const insert = `@${value} `;
  return {text: before + insert + after, caret: before.length + insert.length};
}
