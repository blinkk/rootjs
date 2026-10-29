import type {ComponentChildren, JSX} from 'preact';
import {cn} from '../../utils/classes.js';

export interface DividerProps extends Omit<
  JSX.HTMLAttributes<HTMLElement>,
  'label'
> {
  /**
   * `horizontal` (a full-width rule between blocks) or `vertical` (a rule
   * between items in a row, stretching to the row's height). Default
   * `horizontal`.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Text centered in a horizontal rule, e.g. "or". */
  label?: ComponentChildren;
  /** Uses the stronger border color. */
  strong?: boolean;
  className?: string;
}

/**
 * A thin rule that separates content. Replaces Mantine's `Divider` (menu
 * separators belong to `Menu`).
 *
 * ```tsx
 * <Divider />
 * <Divider label="or" />
 * <div className="flex items-center gap-2">A <Divider orientation="vertical" /> B</div>
 * ```
 */
export function Divider(props: DividerProps) {
  const {
    orientation = 'horizontal',
    label,
    strong = false,
    className,
    ...rest
  } = props;
  const color = strong ? 'border-border-strong' : 'border-border';

  if (orientation === 'vertical') {
    return (
      <div
        {...(rest as JSX.HTMLAttributes<HTMLDivElement>)}
        role="separator"
        aria-orientation="vertical"
        className={cn(
          'Divider',
          'Divider--orientation-vertical',
          'w-0 shrink-0 self-stretch border-0 border-l border-solid',
          color,
          className
        )}
      />
    );
  }

  if (label !== undefined && label !== null) {
    // The label is real text, so it's read; the rules either side are
    // decoration.
    return (
      <div
        {...(rest as JSX.HTMLAttributes<HTMLDivElement>)}
        className={cn(
          'Divider',
          'Divider--orientation-horizontal',
          'Divider--labeled',
          'flex items-center gap-3 text-xs text-muted',
          className
        )}
      >
        <span
          className={cn(
            'Divider__line flex-1 border-0 border-t border-solid',
            color
          )}
          aria-hidden="true"
        />
        <span className="Divider__label shrink-0">{label}</span>
        <span
          className={cn(
            'Divider__line flex-1 border-0 border-t border-solid',
            color
          )}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <hr
      {...(rest as JSX.HTMLAttributes<HTMLHRElement>)}
      className={cn(
        'Divider',
        'Divider--orientation-horizontal',
        'm-0 h-0 w-full border-0 border-t border-solid',
        color,
        className
      )}
    />
  );
}
