import type {JSX} from 'preact';
import {cn} from '../../utils/classes.js';

export interface SkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /**
   * `block` (a rectangle; size it with classes, e.g. `h-24 w-full`),
   * `text` (one or more lines of body text) or `circle` (an avatar; size it
   * with `size-*`). Default `block`.
   */
  variant?: 'block' | 'text' | 'circle';
  /** For `text`: how many lines. The last one is shorter. Default 1. */
  lines?: number;
  className?: string;
}

const SHAPE_CLASSES = 'bg-surface-active motion-safe:animate-pulse';

/**
 * A pulsing placeholder for content that's loading. It's hidden from screen
 * readers, so announce the loading state elsewhere (e.g. `aria-busy` on the
 * region, or a `Spinner` label).
 *
 * ```tsx
 * <Skeleton variant="circle" className="size-8" />
 * <Skeleton variant="text" lines={3} />
 * <Skeleton className="h-32 w-full" />
 * ```
 */
export function Skeleton(props: SkeletonProps) {
  const {variant = 'block', lines = 1, className, ...rest} = props;

  if (variant === 'text') {
    return (
      <div
        {...rest}
        aria-hidden="true"
        className={cn(
          'Skeleton',
          'Skeleton--variant-text',
          'flex w-full flex-col gap-2',
          className
        )}
      >
        {Array.from({length: Math.max(1, lines)}, (_, i) => (
          <div
            key={i}
            className={cn(
              'Skeleton__line h-3 rounded-sm',
              SHAPE_CLASSES,
              lines > 1 && i === lines - 1 ? 'w-3/5' : 'w-full'
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      {...rest}
      aria-hidden="true"
      className={cn(
        'Skeleton',
        `Skeleton--variant-${variant}`,
        SHAPE_CLASSES,
        variant === 'circle'
          ? 'size-8 shrink-0 rounded-full'
          : 'h-4 rounded-md',
        className
      )}
    />
  );
}
