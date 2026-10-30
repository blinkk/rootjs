import {cn} from '../../../../utils/classes.js';

/**
 * A small amber dot shown before a data source's sync time when it was synced
 * after its last publish, i.e. it has unpublished changes.
 */
export function NewerSyncDot(props: {className?: string}) {
  return (
    <span
      className={cn(
        'NewerSyncDot inline-block size-1.5 shrink-0 rounded-full bg-warning',
        props.className
      )}
      aria-hidden="true"
    />
  );
}
