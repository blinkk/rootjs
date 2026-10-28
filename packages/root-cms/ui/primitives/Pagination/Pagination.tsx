import {IconChevronLeft, IconChevronRight} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {cn} from '../../utils/classes.js';
import {BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES} from '../Button/Button.js';

const DOTS = 'dots';
type PageItem = number | typeof DOTS;

function range(start: number, end: number): number[] {
  return Array.from({length: end - start + 1}, (_, i) => start + i);
}

/**
 * The page numbers to show, with `'dots'` where a run is skipped. The list
 * has the same length wherever the current page is, so the control doesn't
 * jump around as you page through. `getPageItems(10, 5, 1, 1)` is
 * `[1, 'dots', 4, 5, 6, 'dots', 10]`.
 */
export function getPageItems(
  total: number,
  page: number,
  siblings: number,
  boundaries: number
): PageItem[] {
  if (siblings * 2 + 3 + boundaries * 2 >= total) {
    return range(1, total);
  }
  const left = Math.max(page - siblings, boundaries);
  const right = Math.min(page + siblings, total - boundaries);
  const leftDots = left > boundaries + 2;
  const rightDots = right < total - (boundaries + 1);
  if (!leftDots && rightDots) {
    return [
      ...range(1, siblings * 2 + boundaries + 2),
      DOTS,
      ...range(total - boundaries + 1, total),
    ];
  }
  if (leftDots && !rightDots) {
    return [
      ...range(1, boundaries),
      DOTS,
      ...range(total - (boundaries + 1 + 2 * siblings), total),
    ];
  }
  return [
    ...range(1, boundaries),
    DOTS,
    ...range(left, right),
    DOTS,
    ...range(total - boundaries + 1, total),
  ];
}

export interface PaginationProps extends Omit<
  JSX.HTMLAttributes<HTMLElement>,
  'onChange'
> {
  /** Total number of pages. Nothing renders when it's 1 or less. */
  total: number;
  /** The current page, 1-based. */
  page: number;
  /** Called with the page the user picked. */
  onChange: (page: number) => void;
  /**
   * Pages shown either side of the current one on wider screens. Below
   * `sm` it's always 0, so the control fits a phone. Default 1.
   */
  siblings?: number;
  /** Pages always shown at each end. Default 1. */
  boundaries?: number;
  /** Names the landmark for screen readers. Default "Pagination". */
  'aria-label'?: string;
  className?: string;
}

const ITEM_CLASSES = cn(
  BUTTON_BASE_CLASSES,
  'Pagination__item h-control-sm min-w-control-sm px-1.5 text-sm tabular-nums'
);

/**
 * Previous / next buttons around a row of page numbers, with "…" for the
 * pages skipped. Below `sm` it shows fewer numbers, so it fits at 375px.
 * Replaces Mantine's `Pagination`.
 *
 * ```tsx
 * <Pagination total={pages} page={page} onChange={setPage} />
 * ```
 */
export function Pagination(props: PaginationProps) {
  const {
    total,
    page,
    onChange,
    siblings = 1,
    boundaries = 1,
    'aria-label': ariaLabel = 'Pagination',
    className,
    ...rest
  } = props;
  if (total <= 1) {
    return null;
  }

  const renderItems = (items: PageItem[], listClassName: string) => (
    <ol
      className={cn(
        'Pagination__list m-0 list-none items-center gap-1 p-0',
        listClassName
      )}
    >
      {items.map((item, i) =>
        item === DOTS ? (
          <li
            key={`dots-${i}`}
            className="Pagination__dots flex min-w-control-sm justify-center text-sm text-muted"
            aria-hidden="true"
          >
            …
          </li>
        ) : (
          <li key={item} className="flex">
            <button
              type="button"
              className={cn(
                ITEM_CLASSES,
                BUTTON_VARIANT_CLASSES[item === page ? 'primary' : 'default']
              )}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Page ${item}`}
              onClick={() => item !== page && onChange(item)}
            >
              {item}
            </button>
          </li>
        )
      )}
    </ol>
  );

  return (
    <nav
      {...rest}
      aria-label={ariaLabel}
      className={cn('Pagination', 'flex items-center gap-1', className)}
    >
      <button
        type="button"
        className={cn(
          ITEM_CLASSES,
          BUTTON_VARIANT_CLASSES.default,
          'Pagination__prev'
        )}
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <IconChevronLeft className="size-4" aria-hidden="true" />
      </button>
      {renderItems(getPageItems(total, page, 0, boundaries), 'flex sm:hidden')}
      {renderItems(
        getPageItems(total, page, siblings, boundaries),
        'hidden sm:flex'
      )}
      <button
        type="button"
        className={cn(
          ITEM_CLASSES,
          BUTTON_VARIANT_CLASSES.default,
          'Pagination__next'
        )}
        aria-label="Next page"
        disabled={page >= total}
        onClick={() => onChange(page + 1)}
      >
        <IconChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
