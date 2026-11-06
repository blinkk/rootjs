import {useEffect, useState} from 'preact/hooks';

/** The docs selected for a bulk action in a collection's docs list. */
export interface DocSelection {
  /** The selected doc ids, in list order. */
  selectedIds: string[];
  /**
   * Whether any doc is selected. While a selection is active, clicking a doc
   * in the list adds or removes it instead of opening it.
   */
  active: boolean;
  /** Returns whether the doc is selected. */
  isSelected: (docId: string) => boolean;
  /** Adds or removes a doc. */
  toggle: (docId: string) => void;
  /**
   * Selects every doc between the last doc clicked and `docId` (Shift-click).
   * With no previous click, selects just `docId`.
   */
  selectRange: (docId: string) => void;
  /** Selects every doc in the list. */
  selectAll: () => void;
  /** Clears the selection. */
  clear: () => void;
}

interface SelectionState {
  selected: Set<string>;
  /** The last doc clicked, where a Shift-click range starts. */
  anchor: string | null;
}

const EMPTY_STATE: SelectionState = {selected: new Set(), anchor: null};

/**
 * Tracks the docs selected for bulk actions. `docIds` is the list in display
 * order; ids that leave the list (e.g. after a delete or a filter change) are
 * dropped from the selection.
 */
export function useDocSelection(docIds: string[]): DocSelection {
  const [state, setState] = useState<SelectionState>(EMPTY_STATE);

  const docIdsKey = docIds.join('\n');
  useEffect(() => {
    setState((prev) => {
      if (prev.selected.size === 0) {
        return prev;
      }
      const present = new Set(docIds);
      const selected = new Set(
        Array.from(prev.selected).filter((id) => present.has(id))
      );
      const anchor =
        prev.anchor && present.has(prev.anchor) ? prev.anchor : null;
      if (selected.size === prev.selected.size && anchor === prev.anchor) {
        return prev;
      }
      return {selected, anchor};
    });
  }, [docIdsKey]);

  function toggle(docId: string) {
    setState((prev) => {
      const selected = new Set(prev.selected);
      if (selected.has(docId)) {
        selected.delete(docId);
      } else {
        selected.add(docId);
      }
      return {selected, anchor: docId};
    });
  }

  function selectRange(docId: string) {
    setState((prev) => {
      const selected = new Set(prev.selected);
      const from = prev.anchor ? docIds.indexOf(prev.anchor) : -1;
      const to = docIds.indexOf(docId);
      if (from === -1 || to === -1) {
        selected.add(docId);
      } else {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        for (let i = start; i <= end; i++) {
          selected.add(docIds[i]);
        }
      }
      return {selected, anchor: docId};
    });
  }

  function selectAll() {
    setState((prev) => ({selected: new Set(docIds), anchor: prev.anchor}));
  }

  function clear() {
    setState(EMPTY_STATE);
  }

  return {
    selectedIds: docIds.filter((id) => state.selected.has(id)),
    active: state.selected.size > 0,
    isSelected: (docId: string) => state.selected.has(docId),
    toggle,
    selectRange,
    selectAll,
    clear,
  };
}
