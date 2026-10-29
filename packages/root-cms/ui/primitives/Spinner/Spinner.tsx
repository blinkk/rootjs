import {cn} from '../../utils/classes.js';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  /** `sm` 14px (inside dense controls), `md` 16px, `lg` 24px. Default `md`. */
  size?: SpinnerSize;
  /**
   * Accessible label announced to screen readers. Pass `null` when the
   * spinner sits inside something that already conveys the busy state (e.g.
   * a button with `aria-busy`).
   */
  label?: string | null;
  className?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-6',
};

/**
 * A loading indicator. Inherits the text color, so it matches whatever it
 * sits in. Replaces Mantine's `Loader`.
 */
export function Spinner(props: SpinnerProps) {
  const size = props.size ?? 'md';
  const label = props.label === undefined ? 'Loading' : props.label;
  return (
    <svg
      className={cn(
        'Spinner',
        `Spinner--size-${size}`,
        'shrink-0 animate-spin',
        SIZE_CLASSES[size],
        props.className
      )}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <circle
        className="Spinner__track opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        className="Spinner__arc"
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
  );
}
