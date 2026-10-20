import type {FieldCondition} from '../core/schema.js';

/**
 * Normalizes a field's `showWhen` config to a list of conditions.
 */
export function toFieldConditions(
  showWhen: FieldCondition | FieldCondition[] | undefined
): FieldCondition[] {
  if (!showWhen) {
    return [];
  }
  return Array.isArray(showWhen) ? showWhen : [showWhen];
}

/**
 * Returns the deep key of a field's sibling, e.g. for the field at
 * `fields.hero.title` and a condition field of `cta._type`, this returns
 * `fields.hero.cta._type`.
 */
export function getSiblingDeepKey(deepKey: string, siblingPath: string) {
  const index = deepKey.lastIndexOf('.');
  if (index === -1) {
    return siblingPath;
  }
  return `${deepKey.slice(0, index)}.${siblingPath}`;
}

/**
 * Tests whether a value matches a single field condition.
 */
export function testFieldCondition(
  condition: FieldCondition,
  value: any
): boolean {
  if ('equals' in condition) {
    return value === condition.equals;
  }
  if ('notEquals' in condition) {
    return value !== condition.notEquals;
  }
  if (condition.in) {
    return condition.in.includes(value);
  }
  if (condition.notIn) {
    return !condition.notIn.includes(value);
  }
  if (typeof condition.exists === 'boolean') {
    return condition.exists === !isEmptyValue(value);
  }
  return Boolean(value);
}

/**
 * Tests whether all of a field's `showWhen` conditions match.
 *
 * ```ts
 * testShowWhen(field.showWhen, (path) => getValue(path));
 * ```
 */
export function testShowWhen(
  showWhen: FieldCondition | FieldCondition[] | undefined,
  getSiblingValue: (path: string) => any
): boolean {
  return toFieldConditions(showWhen).every((condition) =>
    testFieldCondition(condition, getSiblingValue(condition.field))
  );
}

function isEmptyValue(value: any): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  return Array.isArray(value) && value.length === 0;
}
