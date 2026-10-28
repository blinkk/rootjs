import {Pagination as PaginationPrimitive} from '../../primitives/Pagination/Pagination.js';
import {cn} from '../../utils/classes.js';

export interface PaginationProps {
  className?: string;
  /** Total number of pages. */
  total: number;
  /** The 1-based current page. */
  page: number;
  /** Called when the user selects a different page. */
  onChange: (page: number) => void;
}

/**
 * The `Pagination` primitive, centered below a list view (e.g. the action
 * logs and the asset library). Renders nothing when there is a single page
 * or none.
 */
export function Pagination(props: PaginationProps) {
  if (props.total <= 1) {
    return null;
  }
  return (
    <div
      className={cn('PaginationBar flex justify-center py-4', props.className)}
    >
      <PaginationPrimitive
        total={props.total}
        page={props.page}
        onChange={props.onChange}
      />
    </div>
  );
}

export interface PaginationSummaryProps {
  className?: string;
  /** 1-based index of the first item shown on the current page. */
  start: number;
  /** 1-based index of the last item shown on the current page. */
  end: number;
  /** Total number of items across all pages. */
  total: number;
  /** Singular noun for the items, e.g. `asset` or `action`. */
  noun: string;
  /** Optional trailing note, e.g. `filtered from 500 total`. */
  note?: string;
}

/**
 * A short "Showing X–Y of Z" summary that pairs with {@link Pagination}.
 */
export function PaginationSummary(props: PaginationSummaryProps) {
  const {start, end, total, noun, note} = props;
  const nounLabel = total === 1 ? noun : `${noun}s`;
  let text: string;
  if (total === 0) {
    text = `No ${noun}s`;
  } else if (start === end) {
    text = `Showing ${start} of ${total} ${nounLabel}`;
  } else {
    text = `Showing ${start}–${end} of ${total} ${nounLabel}`;
  }
  return (
    <div
      className={cn('PaginationSummary text-sm text-muted', props.className)}
    >
      {text}
      {note ? ` (${note})` : ''}
    </div>
  );
}
