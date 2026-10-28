import {IconUser} from '@tabler/icons-preact';
import type {ComponentChildren, JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-5 text-xs',
  sm: 'size-6 text-xs',
  md: 'size-7 text-sm',
  lg: 'size-8 text-sm',
  xl: 'size-10 text-base',
};

const ICON_SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-4',
  xl: 'size-5',
};

export interface AvatarProps extends Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  'size' | 'children'
> {
  /** Image URL. When it's missing or fails to load, the fallback shows. */
  src?: string | null;
  /**
   * Who or what the avatar shows, e.g. a user's name or email. Used as the
   * image's alt text and the fallback's accessible name. Omit it when the
   * name is already shown next to the avatar, so it isn't read twice.
   */
  alt?: string;
  /**
   * Fallback content when there's no image: initials (e.g. "SL"), a count
   * (e.g. "+3") or an icon. Defaults to a person icon.
   */
  children?: ComponentChildren;
  /** Diameter: `xs` 20px, `sm` 24px, `md` 28px, `lg` 32px, `xl` 40px. Default `md`. */
  size?: AvatarSize;
  /** Rounded square instead of a circle. */
  square?: boolean;
  className?: string;
}

/**
 * A user's (or anything's) picture, falling back to initials or an icon when
 * there's no image. Replaces Mantine's `Avatar`. Color a fallback by passing
 * classes or a `style` (e.g. a background color hashed from the user's
 * email).
 *
 * ```tsx
 * <Avatar src={user.photoURL} alt={user.email} size="xs" />
 * <Avatar alt="3 more viewers">+3</Avatar>
 * ```
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>((props, ref) => {
  const {
    src,
    alt,
    children,
    size = 'md',
    square = false,
    className,
    ...rest
  } = props;
  const [failed, setFailed] = useState(false);
  // A new image gets a fresh chance to load.
  useEffect(() => setFailed(false), [src]);
  const showImage = !!src && !failed;

  return (
    <span
      {...rest}
      ref={ref}
      role={showImage ? undefined : alt ? 'img' : undefined}
      aria-label={showImage ? undefined : alt || undefined}
      aria-hidden={!showImage && !alt ? true : undefined}
      className={cn(
        'Avatar',
        `Avatar--size-${size}`,
        square && 'Avatar--square',
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-chip align-middle font-sans font-semibold uppercase leading-none text-muted',
        square ? 'rounded-md' : 'rounded-full',
        SIZE_CLASSES[size],
        className
      )}
    >
      {showImage ? (
        <img
          className="Avatar__image size-full object-cover"
          src={src}
          alt={alt || ''}
          onError={() => setFailed(true)}
        />
      ) : (
        (children ?? (
          <IconUser className={cn('Avatar__icon', ICON_SIZE_CLASSES[size])} />
        ))
      )}
    </span>
  );
});
