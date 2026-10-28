import type {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {cn} from '../../utils/classes.js';
import {
  BUTTON_BASE_CLASSES,
  BUTTON_VARIANT_CLASSES,
  type ButtonSize,
  type ButtonVariant,
} from '../Button/Button.js';
import {Spinner} from '../Spinner/Spinner.js';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'size-control-xs *:size-3.5',
  sm: 'size-control-sm *:size-4',
  md: 'size-control-md *:size-5',
};

interface IconButtonOwnProps {
  /**
   * What the button does, e.g. "Delete field". Required: it's the button's
   * accessible name, since the icon alone has none.
   */
  label: string;
  /** The icon, e.g. `<IconTrash />`. Sized by the button. */
  children: ComponentChildren;
  /** Same variants as `Button`. Default `subtle`. */
  variant?: ButtonVariant;
  /** Square size: `xs` 24px, `sm` 28px, `md` 36px. Default `sm`. */
  size?: ButtonSize;
  /** Makes it a toggle button: sets `aria-pressed` and a pressed style. */
  pressed?: boolean;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  /** Fully rounded instead of the standard corner radius. */
  round?: boolean;
  className?: string;
}

type IconButtonAsButton = IconButtonOwnProps &
  Omit<
    JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    keyof IconButtonOwnProps
  > & {href?: undefined};

type IconButtonAsLink = IconButtonOwnProps &
  Omit<
    JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof IconButtonOwnProps
  > & {href: string; disabled?: boolean};

export type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

/**
 * A square, icon-only button (or link, when `href` is set). Replaces
 * Mantine's `ActionIcon`.
 *
 * ```tsx
 * <IconButton label="Delete field" onClick={remove}>
 *   <IconTrash />
 * </IconButton>
 * ```
 */
// `forwardRef` wraps props in `Omit<P, 'ref'>`, which collapses the
// button/link union to their shared keys, so the result is re-typed.
export const IconButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  IconButtonProps
>((props, ref) => {
  const {
    label,
    children,
    variant = 'subtle',
    size = 'sm',
    pressed,
    loading = false,
    round = false,
    className,
    ...rest
  } = props;

  const classes = cn(
    'IconButton',
    `IconButton--variant-${variant}`,
    `IconButton--size-${size}`,
    round && 'IconButton--round',
    BUTTON_BASE_CLASSES,
    BUTTON_VARIANT_CLASSES[variant],
    'aria-pressed:bg-surface-active',
    SIZE_CLASSES[size],
    round && 'rounded-full',
    className
  );
  const content = loading ? (
    <Spinner size="sm" label={null} className="IconButton__spinner" />
  ) : (
    children
  );

  if (rest.href !== undefined) {
    const {disabled, href, ...anchorProps} = rest as IconButtonAsLink;
    const inactive = disabled || loading;
    return (
      <a
        {...anchorProps}
        ref={ref as Ref<HTMLAnchorElement>}
        href={inactive ? undefined : href}
        aria-label={label}
        aria-disabled={inactive || undefined}
        aria-busy={loading || undefined}
        className={classes}
      >
        {content}
      </a>
    );
  }

  const {
    type = 'button',
    disabled,
    ...buttonProps
  } = rest as IconButtonAsButton;
  return (
    <button
      {...buttonProps}
      ref={ref as Ref<HTMLButtonElement>}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}) as unknown as FunctionComponent<
  IconButtonProps & {ref?: Ref<HTMLButtonElement | HTMLAnchorElement>}
>;
