import {useEffect, useMemo, useState} from 'preact/hooks';

export interface UsePaginationOptions {
  /** Number of items per page. */
  pageSize: number;
  /**
   * When any value in this list changes, the current page resets to 1. Use
   * this for filter/search state so that changing a filter returns the user to
   * the first page of results.
   */
  resetDeps?: unknown[];
}

export interface PaginationState<T> {
  /** The 1-based current page number. */
  page: number;
  /** Navigates to the given 1-based page. */
  setPage: (page: number) => void;
  /** Total number of pages (always at least 1). */
  totalPages: number;
  /** The subset of items on the current page. */
  pageItems: T[];
  /** Total number of items across all pages. */
  totalItems: number;
  /** 1-based index of the first item on the current page (0 when empty). */
  start: number;
  /** 1-based index of the last item on the current page (0 when empty). */
  end: number;
}

/**
 * Client-side pagination for an in-memory list. Slices `items` into pages of
 * `pageSize`, tracks the current page, clamps it whenever the result set
 * shrinks, and resets to the first page when `resetDeps` change.
 *
 * Shared by list views such as the action logs and the asset library.
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions
): PaginationState<T> {
  const {pageSize, resetDeps} = options;
  const [currentPage, setCurrentPage] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Clamp so a shrinking result set never strands the user on an empty page.
  // The raw page state is only normalized on the next interaction or reset,
  // but rendering always uses this clamped value.
  const page = Math.min(Math.max(currentPage, 1), totalPages);

  // Reset to the first page when the reset dependencies change (e.g. filters).
  useEffect(() => {
    setCurrentPage(1);
  }, resetDeps ?? []);

  const pageItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, page, pageSize]);

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return {
    page,
    setPage: setCurrentPage,
    totalPages,
    pageItems,
    totalItems,
    start,
    end,
  };
}
