import * as schema from '../../../core/schema.js';
import {testValidRichTextData} from '../../../shared/richtext.js';
import {deepEqual, isObject} from '../../utils/objects.js';

export interface TestFieldEmptyOptions {
  /**
   * Treat values that match the field's schema `default` as empty. Defaults are
   * written into the doc when it (or an array item, or a oneOf type) is
   * created, so a value equal to the default doesn't mean anyone entered data.
   */
  ignoreDefaults?: boolean;
}

/**
 * Returns whether a field's value should be considered empty.
 *
 * Handles nested objects and arrays, along with primitive fields.
 * This helper is primarily used to hide deprecated fields when they
 * contain no meaningful data.
 */
export function testFieldEmpty(
  field: schema.Field,
  value: any,
  types: Record<string, schema.Schema> = {},
  options: TestFieldEmptyOptions = {}
): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (
    options.ignoreDefaults &&
    field.default !== undefined &&
    deepEqual(toPlainValue(field, value), field.default)
  ) {
    return true;
  }

  switch (field.type) {
    case 'string':
    case 'select':
    case 'date':
    case 'datetime':
      return value === '';
    case 'multiselect':
      return !Array.isArray(value) || value.length === 0;
    case 'number':
    case 'boolean':
      return value === undefined || value === null;
    case 'image':
    case 'file':
      return !value || !value.src;
    case 'password':
      return !value || !value.hash;
    case 'reference':
      return !value || !value.id;
    case 'references':
      return !Array.isArray(value) || value.length === 0;
    case 'richtext':
      return !testValidRichTextData(value);
    case 'object':
      if (!isObject(value) || Object.keys(value).length === 0) {
        return true;
      }
      for (const child of field.fields || []) {
        if (!child.id) {
          continue;
        }
        if (!testFieldEmpty(child, value[child.id], types, options)) {
          return false;
        }
      }
      return true;
    case 'array':
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return true;
        }
        for (const item of value) {
          if (!testFieldEmpty(field.of, item, types, options)) {
            return false;
          }
        }
        return true;
      }
      if (
        !isObject(value) ||
        !Array.isArray(value._array) ||
        value._array.length === 0
      ) {
        return true;
      }
      for (const key of value._array) {
        if (!testFieldEmpty(field.of, value[key], types, options)) {
          return false;
        }
      }
      return true;
    case 'oneof': {
      if (!isObject(value) || !value._type) {
        return true;
      }
      let sub: schema.Schema | undefined;
      // `schema.glob()` patterns are resolved to schemas at project load.
      const fieldTypes = Array.isArray(field.types) ? field.types : [];
      if (typeof fieldTypes[0] === 'string') {
        if ((fieldTypes as string[]).includes(value._type)) {
          sub = types[value._type];
        }
      } else {
        sub = (fieldTypes as any[]).find((t) => t.name === value._type);
      }
      if (!sub) {
        return true;
      }
      for (const child of sub.fields || []) {
        if (!child.id) {
          continue;
        }
        if (!testFieldEmpty(child, value[child.id], types, options)) {
          return false;
        }
      }
      return true;
    }
    default:
      return false;
  }
}

/**
 * Converts array fields stored as an "array map" (`{_array: ['k1'], k1: ...}`)
 * back to a plain array so they can be compared against a schema default.
 */
function toPlainValue(field: schema.Field, value: any) {
  if (
    field.type === 'array' &&
    isObject(value) &&
    Array.isArray(value._array)
  ) {
    return value._array.map((key: string) => value[key]);
  }
  return value;
}
