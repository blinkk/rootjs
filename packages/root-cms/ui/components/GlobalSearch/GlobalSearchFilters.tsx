import {IconCheck, IconLink} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {GLOBAL_SEARCH_FILTERS, GlobalSearchFilter} from './search-filters.js';

/** Number of results available for each filter chip. */
export type GlobalSearchCounts = Partial<
  Record<Exclude<GlobalSearchFilter, 'all'>, number>
>;

export interface GlobalSearchFiltersProps {
  /** The active filter. */
  value: GlobalSearchFilter;
  onChange: (filter: GlobalSearchFilter) => void;
  /** Result counts per type, used to annotate the chips. */
  counts: GlobalSearchCounts;
  /** Called when the user clicks "Copy link". Resolves to true on success. */
  onCopyLink: () => Promise<boolean>;
}

/** How long the "Copied" confirmation stays visible on the copy button. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * Row of result-type chips rendered between the global search input and the
 * results list, plus a "Copy link" button that copies a shareable deep link
 * to the current search.
 */
export function GlobalSearchFilters(props: GlobalSearchFiltersProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const handle = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS
    );
    return () => window.clearTimeout(handle);
  }, [copied]);

  const total = Object.values(props.counts).reduce(
    (sum, n) => sum + (n || 0),
    0
  );

  return (
    <div
      className="GlobalSearchFilters"
      role="group"
      aria-label="Filter results"
    >
      <div className="GlobalSearchFilters__chips">
        {GLOBAL_SEARCH_FILTERS.map((option) => {
          const count =
            option.id === 'all' ? total : props.counts[option.id] || 0;
          const active = option.id === props.value;
          return (
            <button
              key={option.id}
              type="button"
              className={joinClassNames(
                'GlobalSearchFilters__chip',
                active && 'GlobalSearchFilters__chip--active',
                count === 0 && 'GlobalSearchFilters__chip--empty'
              )}
              aria-pressed={active}
              // Keep focus in the search input so typing continues to work
              // after picking a filter.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.onChange(option.id)}
            >
              <span>{option.label}</span>
              {count > 0 && (
                <span className="GlobalSearchFilters__count">{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={joinClassNames(
          'GlobalSearchFilters__copy',
          copied && 'GlobalSearchFilters__copy--copied'
        )}
        title="Copy a link to this search"
        onMouseDown={(e) => e.preventDefault()}
        onClick={async () => {
          if (await props.onCopyLink()) {
            setCopied(true);
          }
        }}
      >
        {copied ? <IconCheck size={14} /> : <IconLink size={14} />}
        <span>{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}
