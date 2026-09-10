/**
 * Result types that the global search filter chips can narrow results down
 * to. `all` shows every group.
 */
export type GlobalSearchFilter =
  | 'all'
  | 'docs'
  | 'fields'
  | 'collections'
  | 'data-sources'
  | 'releases';

export interface GlobalSearchFilterOption {
  id: GlobalSearchFilter;
  /** Chip label. */
  label: string;
}

/** Filter chips in display order. */
export const GLOBAL_SEARCH_FILTERS: GlobalSearchFilterOption[] = [
  {id: 'all', label: 'All'},
  {id: 'docs', label: 'Documents'},
  {id: 'fields', label: 'Field matches'},
  {id: 'collections', label: 'Collections'},
  {id: 'data-sources', label: 'Data sources'},
  {id: 'releases', label: 'Releases'},
];

/** Returns the chip label for a filter. */
export function getGlobalSearchFilterLabel(filter: GlobalSearchFilter): string {
  const option = GLOBAL_SEARCH_FILTERS.find((f) => f.id === filter);
  return option?.label || 'All';
}

/** Parses a filter id (e.g. from a URL param), falling back to `all`. */
export function parseGlobalSearchFilter(
  value: string | null | undefined
): GlobalSearchFilter {
  if (!value) {
    return 'all';
  }
  const option = GLOBAL_SEARCH_FILTERS.find((f) => f.id === value);
  return option ? option.id : 'all';
}

/** URL param that flags the open modal, e.g. `?modal=search`. */
export const SEARCH_MODAL_PARAM = 'modal';
/** Value of `SEARCH_MODAL_PARAM` that opens the global search. */
export const SEARCH_MODAL_VALUE = 'search';
/** URL param holding the search query. */
export const SEARCH_QUERY_PARAM = 'q';
/** URL param holding the active result type filter. */
export const SEARCH_FILTER_PARAM = 'type';

/** The global search state that is mirrored into the URL. */
export interface GlobalSearchUrlState {
  query: string;
  filter: GlobalSearchFilter;
}

/**
 * Reads the global search deep link state from a URL search string (e.g.
 * `window.location.search`). Returns null when the URL does not target the
 * search modal.
 */
export function readGlobalSearchUrlState(
  search: string
): GlobalSearchUrlState | null {
  const params = new URLSearchParams(search);
  if (params.get(SEARCH_MODAL_PARAM) !== SEARCH_MODAL_VALUE) {
    return null;
  }
  return {
    query: params.get(SEARCH_QUERY_PARAM) || '',
    filter: parseGlobalSearchFilter(params.get(SEARCH_FILTER_PARAM)),
  };
}

/**
 * Returns a new URL search string (including the leading `?`, or an empty
 * string when there are no params) with the global search params applied on
 * top of the existing params. Passing `null` removes the search params.
 */
export function writeGlobalSearchUrlState(
  search: string,
  state: GlobalSearchUrlState | null
): string {
  const params = new URLSearchParams(search);
  params.delete(SEARCH_MODAL_PARAM);
  params.delete(SEARCH_QUERY_PARAM);
  params.delete(SEARCH_FILTER_PARAM);
  if (state) {
    params.set(SEARCH_MODAL_PARAM, SEARCH_MODAL_VALUE);
    if (state.query) {
      params.set(SEARCH_QUERY_PARAM, state.query);
    }
    if (state.filter !== 'all') {
      params.set(SEARCH_FILTER_PARAM, state.filter);
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Builds a shareable CMS path that opens the global search with the given
 * query, e.g. `/cms/?modal=search&q=foo`.
 */
export function buildGlobalSearchUrl(state: GlobalSearchUrlState): string {
  return `/cms/${writeGlobalSearchUrlState('', state)}`;
}
