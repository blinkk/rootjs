import type {Placement} from '../../primitives/floating/useFloating.js';
import {Tooltip} from '../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../utils/classes.js';
import {
  formatDateTime,
  getTimeAgo,
  timestampToMillis,
} from '../../utils/time.js';

export interface RelativeTimeProps {
  /** A Firestore timestamp (or serialized one), `Date` or epoch millis. */
  ts: unknown;
  /**
   * Text added after the date in the tooltip, e.g. "after the last publish"
   * shows "Oct 26, 2026, 1:30 PM, after the last publish".
   */
  tooltipSuffix?: string;
  /** Where the tooltip opens relative to the time. Default `top`. */
  placement?: Placement;
  /** Whether to show a dotted underline hinting at the tooltip. Default true. */
  underline?: boolean;
  className?: string;
}

/**
 * A relative time, e.g. "2 days ago", with the full date and time in a
 * tooltip. Renders nothing for a missing timestamp.
 *
 * ```tsx
 * <RelativeTime ts={release.publishedAt} />
 * ```
 */
export function RelativeTime(props: RelativeTimeProps) {
  const millis = timestampToMillis(props.ts);
  if (!millis) {
    return null;
  }
  const fullDate = formatDateTime(millis);
  return (
    <Tooltip
      placement={props.placement}
      label={
        props.tooltipSuffix ? `${fullDate}, ${props.tooltipSuffix}` : fullDate
      }
    >
      <span
        className={cn(
          'RelativeTime cursor-default whitespace-nowrap',
          props.underline !== false &&
            'underline decoration-dotted underline-offset-3',
          props.className
        )}
      >
        {getTimeAgo(millis)}
      </span>
    </Tooltip>
  );
}
