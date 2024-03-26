type ConditionalString = string | false | null | undefined;

/**
 * Utility method for joining class names together. Ignores falsey values. When
 * there are no classNames, returns `undefined` so that the class attribute
 * would be ignored.
 */
export function joinClassNames(...classNames: ConditionalString[]) {
  return classNames.filter((c) => !!c).join(' ') || undefined;
}
