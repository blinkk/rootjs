import * as schema from '../../core/schema.js';
import {testValidRichTextData} from '../../shared/richtext.js';
import {isObject} from './objects.js';

/**
 * Returns whether a field's value should be considered empty.
 *
 * Handles nested objects and arrays, along with primitive fields.
 * This helper is primarily used to hide deprecated fields when they
 * contain no meaningful data.
 */
export function testFieldEmpty(field: schema.Field, value: any): boolean {
  if (value === undefined || value === null) {
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
    case 'reference':
      return !value || !value.id;
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
        if (!testFieldEmpty(child, value[child.id])) {
          return false;
        }
      }
      return true;
    case 'array':
      if (
        !isObject(value) ||
        !Array.isArray(value._array) ||
        value._array.length === 0
      ) {
        return true;
      }
      for (const key of value._array) {
        if (!testFieldEmpty(field.of, value[key])) {
          return false;
        }
      }
      return false;
    case 'oneof': {
      if (!isObject(value) || !value._type) {
        return true;
      }
      const sub = (field.types || []).find((t) => t.name === value._type);
      if (!sub) {
        return true;
      }
      for (const child of sub.fields || []) {
        if (!child.id) {
          continue;
        }
        if (!testFieldEmpty(child, value[child.id])) {
          return false;
        }
      }
      return true;
    }
    default:
      return false;
  }
}
