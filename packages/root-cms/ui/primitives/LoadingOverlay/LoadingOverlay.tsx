import type {JSX} from 'preact';
import {cn} from '../../utils/classes.js';
import {Spinner, type SpinnerSize} from '../Spinner/Spinner.js';

export interface LoadingOverlayProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'label'
> {
  /** Whether the overlay shows. Renders nothing when false. */
  visible: boolean;
  /** Announced to screen readers, and shown under the spinner when `showLabel`. Default "Loading". */
  label?: string;
  /** Shows `label` as text under the spinner. */
  showLabel?: boolean;
  /** Spinner size. Default `lg`. */
  spinnerSize?: SpinnerSize;
  className?: string;
}

/**
 * Covers its nearest positioned ancestor with a translucent surface and a
 * spinner, blocking clicks while something loads. Give the parent
 * `relative`. Replaces Mantine's `LoadingOverlay`.
 *
 * ```tsx
 * <form className="relative">
 *   <LoadingOverlay visible={saving} label="Saving" />
 *   …
 * </form>
 * ```
 */
export function LoadingOverlay(props: LoadingOverlayProps) {
  const {
    visible,
    label = 'Loading',
    showLabel = false,
    spinnerSize = 'lg',
    className,
    ...rest
  } = props;
  if (!visible) {
    return null;
  }
  return (
    <div
      {...rest}
      role="status"
      className={cn(
        'LoadingOverlay',
        'absolute inset-0 z-(--cms-z-sticky) flex flex-col items-center justify-center gap-2 bg-surface/75 text-muted',
        className
      )}
    >
      <Spinner
        size={spinnerSize}
        label={null}
        className="LoadingOverlay__spinner"
      />
      <span
        className={cn(
          'LoadingOverlay__label text-sm font-medium text-fg',
          !showLabel && 'sr-only'
        )}
      >
        {label}
      </span>
    </div>
  );
}
