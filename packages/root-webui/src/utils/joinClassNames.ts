type MaybeString = string | false | null | undefined;

/**
 * Utility class for joining class names together. Ignores falsy values. When
 * there are no classNames, returns `undefined` so that the class attribute would be
 * ignored.
 */
export function joinClassNames(...classNames: MaybeString[]) {
  return classNames.filter(c => !!c).join(' ') || undefined;
}
