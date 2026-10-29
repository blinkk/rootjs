import {ComponentChildren} from 'preact';
import {cn} from '../../utils/classes.js';

export interface SurfaceProps {
  className?: string;
  children?: ComponentChildren;
}

/** A bordered, rounded card. */
export function Surface(props: SurfaceProps) {
  return (
    <div
      className={cn(
        'Surface',
        'overflow-hidden rounded-lg border border-solid border-border bg-surface',
        props.className
      )}
    >
      {props.children}
    </div>
  );
}
