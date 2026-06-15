import './Pagination.css';

import {Pagination as MantinePagination} from '@mantine/core';
import {joinClassNames} from '../../utils/classes.js';

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
 * Shared pagination control used across CMS list views (e.g. the action logs
 * and the asset library). Renders nothing when there is a single page or none.
 */
export function Pagination(props: PaginationProps) {
  if (props.total <= 1) {
    return null;
  }
  return (
    <div className={joinClassNames(props.className, 'Pagination')}>
      <MantinePagination
        total={props.total}
        value={props.page}
        onChange={props.onChange}
        size="sm"
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
    text = `Showing ${start}\u2013${end} of ${total} ${nounLabel}`;
  }
  return (
    <div className={joinClassNames(props.className, 'Pagination__summary')}>
      {text}
      {note ? ` (${note})` : ''}
    </div>
  );
}
