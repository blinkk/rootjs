import {Collection, ObjectField, Schema} from '../../core/schema.js';
import {toArrayMap} from './array-map.js';

/**
 * Returns the default field values for a collection or object field. Used for
 * initializing a new doc or when adding a new array item.
 */
export function getDefaultFieldValue(field: Collection | ObjectField | Schema) {
  const defaultValue: Record<string, unknown> = {};
  field.fields.forEach((child) => {
    if (!child.id) {
      return;
    }
    if (
      child.type === 'array' &&
      child.default &&
      Array.isArray(child.default)
    ) {
      // Convert to an "array map" for storage in the db.
      defaultValue[child.id] = toArrayMap(child.default);
    } else if (child.default) {
      defaultValue[child.id] = child.default;
    } else if (child.type === 'object') {
      defaultValue[child.id] = getDefaultFieldValue(child);
    }
  });
  return defaultValue;
}
