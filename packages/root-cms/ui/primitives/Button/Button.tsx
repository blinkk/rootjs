import type {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {cn} from '../../utils/classes.js';
import {Spinner} from '../Spinner/Spinner.js';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md';

/**
 * Classes shared by `Button` and `IconButton`: layout, focus ring, disabled
 * state, and a touch target of at least 40px on coarse pointers (an
 * invisible `::after`, so dense layouts don't shift).
 */
export const BUTTON_BASE_CLASSES =
  'relative inline-flex shrink-0 cursor-pointer select-none appearance-none items-center justify-center whitespace-nowrap rounded-sm font-sans font-medium no-underline transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  'pointer-coarse:after:absolute pointer-coarse:after:-inset-2';

/** Colors for each variant, shared by `Button` and `IconButton`. */
export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-hover active:bg-surface-active',
  primary:
    'border border-transparent bg-primary text-on-primary hover:bg-primary-hover',
  danger:
    'border border-transparent bg-danger text-inverse hover:brightness-90',
  subtle:
    'border border-transparent bg-transparent text-fg hover:bg-surface-hover active:bg-surface-active',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-control-xs gap-1 px-2 text-sm',
  sm: 'h-control-sm gap-1.5 px-3 text-sm',
  md: 'h-control-md gap-2 px-4 text-base',
};

/** Sizes the icon slots' svgs, so callers don't pass `size` to each icon. */
const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: '*:size-3.5',
  sm: '*:size-4',
  md: '*:size-4',
};

interface ButtonOwnProps {
  /**
   * `default` (bordered, the everyday button), `primary` (filled; the main
   * action of a view), `danger` (filled; destructive actions), or `subtle`
   * (no border until hovered; toolbars and dense rows). Default `default`.
   */
  variant?: ButtonVariant;
  /** Height: `xs` 24px, `sm` 28px, `md` 36px. Default `sm`. */
  size?: ButtonSize;
  /** Icon before the label, e.g. `<IconPlus />`. Sized by the button. */
  icon?: ComponentChildren;
  /** Icon after the label. */
  iconRight?: ComponentChildren;
  /** Shows a spinner in place of `icon` and disables the button. */
  loading?: boolean;
  /** Stretches the button to its container's width. */
  fullWidth?: boolean;
  className?: string;
  children?: ComponentChildren;
}

type ButtonAsButton = ButtonOwnProps &
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonOwnProps &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps> & {
    /** Renders the button as a link. */
    href: string;
    disabled?: boolean;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * A button, or a link styled as one when `href` is set. Replaces Mantine's
 * `Button`; see `Button.gallery.tsx` for every variant.
 *
 * ```tsx
 * <Button variant="primary" icon={<IconRocket />} loading={saving}>
 *   Publish
 * </Button>
 * <Button href="/cms/releases" variant="subtle">All releases</Button>
 * ```
 */
// `forwardRef` wraps props in `Omit<P, 'ref'>`, which collapses the
// button/link union to their shared keys, so the result is re-typed.
export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>((props, ref) => {
  const {
    variant = 'default',
    size = 'sm',
    icon,
    iconRight,
    loading = false,
    fullWidth = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    'Button',
    `Button--variant-${variant}`,
    `Button--size-${size}`,
    fullWidth && 'Button--fullWidth',
    BUTTON_BASE_CLASSES,
    BUTTON_VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
    className
  );

  const content = (
    <>
      {loading ? (
        <Spinner size="sm" label={null} className="Button__spinner" />
      ) : (
        icon && (
          <span
            className={cn(
              'Button__icon flex shrink-0',
              ICON_SIZE_CLASSES[size]
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )
      )}
      {children !== undefined && children !== null && (
        <span className="Button__label truncate">{children}</span>
      )}
      {iconRight && (
        <span
          className={cn(
            'Button__iconRight flex shrink-0',
            ICON_SIZE_CLASSES[size]
          )}
          aria-hidden="true"
        >
          {iconRight}
        </span>
      )}
    </>
  );

  if (rest.href !== undefined) {
    const {disabled, href, ...anchorProps} = rest as ButtonAsLink;
    const inactive = disabled || loading;
    return (
      <a
        {...anchorProps}
        ref={ref as Ref<HTMLAnchorElement>}
        href={inactive ? undefined : href}
        aria-disabled={inactive || undefined}
        aria-busy={loading || undefined}
        className={classes}
      >
        {content}
      </a>
    );
  }

  const {type = 'button', disabled, ...buttonProps} = rest as ButtonAsButton;
  return (
    <button
      {...buttonProps}
      ref={ref as Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}) as unknown as FunctionComponent<
  ButtonProps & {ref?: Ref<HTMLButtonElement | HTMLAnchorElement>}
>;
