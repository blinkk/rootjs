import {Badge} from '../../../../primitives/Badge/Badge.js';
import {cn} from '../../../../utils/classes.js';

export interface HasChangesBadgeProps {
  /** Called on click, Enter or Space, e.g. to show the changes. */
  onActivate: () => void;
  className?: string;
}

/**
 * A clickable "Has changes" badge for a data source that was synced after it
 * was last published.
 */
export function HasChangesBadge(props: HasChangesBadgeProps) {
  function activate(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    props.onActivate();
  }
  return (
    <Badge
      className={cn(
        'HasChangesBadge cursor-pointer transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        props.className
      )}
      size="xs"
      variant="gradient"
      gradient="orange"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          activate(e);
        }
      }}
    >
      Has changes
    </Badge>
  );
}
