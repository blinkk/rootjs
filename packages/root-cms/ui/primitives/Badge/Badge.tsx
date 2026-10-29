import type {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {cn} from '../../utils/classes.js';

export type BadgeTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';
export type BadgeVariant = 'soft' | 'filled' | 'outline' | 'gradient';
export type BadgeGradient =
  'blue' | 'green' | 'pink' | 'orange' | 'yellow' | 'red' | 'violet' | 'gray';
export type BadgeSize = 'xs' | 'sm';

const TONE_CLASSES: Record<
  Exclude<BadgeVariant, 'gradient'>,
  Record<BadgeTone, string>
> = {
  soft: {
    neutral: 'bg-chip text-fg',
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    violet: 'bg-violet-soft text-violet-strong',
  },
  filled: {
    neutral: 'bg-primary text-on-primary',
    info: 'bg-info text-inverse',
    success: 'bg-success text-inverse',
    warning: 'bg-warning text-inverse',
    danger: 'bg-danger text-inverse',
    violet: 'bg-violet text-inverse',
  },
  outline: {
    neutral: 'border-border-strong bg-surface text-muted',
    info: 'border-info-line bg-surface text-info',
    success: 'border-success-line bg-surface text-success',
    warning: 'border-warning-line bg-surface text-warning',
    danger: 'border-danger-line bg-surface text-danger',
    violet: 'border-violet/40 bg-surface text-violet',
  },
};

/** Backgrounds for `variant="gradient"`, from the `--cms-gradient-*` tokens. */
const GRADIENT_CLASSES: Record<BadgeGradient, string> = {
  blue: 'bg-(image:--cms-gradient-blue)',
  green: 'bg-(image:--cms-gradient-green)',
  pink: 'bg-(image:--cms-gradient-pink)',
  orange: 'bg-(image:--cms-gradient-orange)',
  yellow: 'bg-(image:--cms-gradient-yellow)',
  red: 'bg-(image:--cms-gradient-red)',
  violet: 'bg-(image:--cms-gradient-violet)',
  gray: 'bg-(image:--cms-gradient-gray)',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'h-4 gap-1 px-2',
  sm: 'h-4.5 gap-1 px-2.5',
};

interface BadgeOwnProps {
  /**
   * The status it conveys: `neutral`, `info`, `success`, `warning` or
   * `danger`, or `violet` for AI features and AI-generated content. Pair a
   * tone with a word or icon, not color alone. Default `neutral`.
   */
  tone?: BadgeTone;
  /**
   * `soft` (tinted background, the default), `filled` (solid; for the one
   * badge that must stand out), `outline` (a quiet tag, e.g. "Required") or
   * `gradient` (status pills; see `gradient`).
   */
  variant?: BadgeVariant;
  /**
   * The background for `variant="gradient"`, from the `--cms-gradient-*`
   * theme tokens. Default `blue`.
   */
  gradient?: BadgeGradient;
  /** Height: `xs` 16px, `sm` 18px (10px text). Default `sm`. */
  size?: BadgeSize;
  /** Icon before the label, e.g. `<IconCheck />`. Sized by the badge. */
  icon?: ComponentChildren;
  className?: string;
  children?: ComponentChildren;
}

type BadgeAsSpan = BadgeOwnProps &
  Omit<JSX.HTMLAttributes<HTMLSpanElement>, keyof BadgeOwnProps> & {
    href?: undefined;
  };

type BadgeAsLink = BadgeOwnProps &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BadgeOwnProps> & {
    /** Renders the badge as a link. */
    href: string;
  };

export type BadgeProps = BadgeAsSpan | BadgeAsLink;

/**
 * A small uppercase pill for a status or tag, or a link styled as one when
 * `href` is set. Replaces Mantine's `Badge`.
 *
 * ```tsx
 * <Badge tone="success" variant="filled" icon={<IconCheck />}>Success</Badge>
 * <Badge variant="outline" size="xs">Required</Badge>
 * <Badge variant="gradient" gradient="green">Published</Badge>
 * ```
 */
// `forwardRef` wraps props in `Omit<P, 'ref'>`, which collapses the
// span/link union to their shared keys, so the result is re-typed.
export const Badge = forwardRef<
  HTMLSpanElement | HTMLAnchorElement,
  BadgeProps
>((props, ref) => {
  const {
    tone = 'neutral',
    variant = 'soft',
    gradient = 'blue',
    size = 'sm',
    icon,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    'Badge',
    `Badge--tone-${tone}`,
    `Badge--variant-${variant}`,
    variant === 'gradient' && `Badge--gradient-${gradient}`,
    `Badge--size-${size}`,
    'inline-flex max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent align-middle font-sans text-2xs font-bold uppercase leading-none tracking-wide no-underline',
    variant === 'gradient'
      ? cn('text-inverse', GRADIENT_CLASSES[gradient])
      : TONE_CLASSES[variant][tone],
    SIZE_CLASSES[size],
    rest.href !== undefined &&
      'cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    className
  );

  const content = (
    <>
      {icon && (
        <span className="Badge__icon flex shrink-0 *:size-3" aria-hidden="true">
          {icon}
        </span>
      )}
      {children !== undefined && children !== null && (
        <span className="Badge__label truncate">{children}</span>
      )}
    </>
  );

  if (rest.href !== undefined) {
    return (
      <a
        {...(rest as BadgeAsLink)}
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
      >
        {content}
      </a>
    );
  }
  return (
    <span
      {...(rest as BadgeAsSpan)}
      ref={ref as Ref<HTMLSpanElement>}
      className={classes}
    >
      {content}
    </span>
  );
}) as unknown as FunctionComponent<
  BadgeProps & {ref?: Ref<HTMLSpanElement | HTMLAnchorElement>}
>;
