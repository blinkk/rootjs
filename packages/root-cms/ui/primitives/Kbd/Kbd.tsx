import type {ComponentChildren, JSX} from 'preact';
import {cn} from '../../utils/classes.js';

export interface KbdProps extends JSX.HTMLAttributes<HTMLElement> {
  /** The key or shortcut, e.g. "Esc" or "⌘ K". */
  children: ComponentChildren;
  className?: string;
}

/**
 * A keyboard key or shortcut hint, rendered as a native `<kbd>` chip.
 *
 * ```tsx
 * <Kbd>{isMac ? '⌘ K' : 'Ctrl K'}</Kbd>
 * ```
 */
export function Kbd(props: KbdProps) {
  const {children, className, ...rest} = props;
  return (
    <kbd
      {...rest}
      className={cn(
        'Kbd',
        'inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-sm bg-chip px-1.5 align-middle font-mono text-xs font-bold leading-none text-fg',
        className
      )}
    >
      {children}
    </kbd>
  );
}
