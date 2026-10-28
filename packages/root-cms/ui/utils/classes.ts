import {twMerge} from 'tailwind-merge';

type MaybeString = string | false | null | undefined;

/**
 * Utility class for joining class names together. Ignores falsy values. When
 * there are no classNames, returns `undefined` so that the class attribute would be
 * ignored.
 */
export function joinClassNames(...classNames: MaybeString[]) {
  return classNames.filter((c) => !!c).join(' ') || undefined;
}

/**
 * Joins class names like `joinClassNames()`, and also resolves conflicting
 * Tailwind utilities so the last one wins. Use it in components that accept
 * a `className` prop, so callers can override the component's own utilities.
 *
 * ```tsx
 * cn('Button px-3 text-sm', props.className); // 'px-4' from the caller wins.
 * ```
 */
export function cn(...classNames: MaybeString[]) {
  return twMerge(classNames) || undefined;
}
