import {
  Collection,
  ObjectField,
  ObjectLikeField,
  Schema,
} from '../../core/schema.js';
import {toArrayMap} from './array-map.js';
import {isObject} from './objects.js';

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

/**
 * Normalizes a preset's `data` payload so it can be stored in the draft doc.
 * In particular, plain `[]` arrays at `array`-field positions are converted to
 * the internal array-map shape (`{_array: ['k1'], k1: {...}}`) used by the CMS
 * array UI. Authors can write natural-looking arrays in their presets without
 * worrying about this implementation detail.
 *
 * Recurses into `object` and `oneof` fields. For arrays of objects/oneOfs,
 * each item is normalized in turn.
 */
export function normalizePresetData(
  schemaOrField: Collection | ObjectField | Schema,
  data: Record<string, any>,
  types?: Record<string, Schema>
): Record<string, any> {
  const result: Record<string, any> = {...data};
  schemaOrField.fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const value = result[field.id];
    if (value === undefined || value === null) {
      return;
    }
    if (field.type === 'array' && Array.isArray(value)) {
      const items = value.map((item) =>
        normalizeArrayItem(field.of, item, types)
      );
      result[field.id] = toArrayMap(items);
    } else if (field.type === 'object' && isObject(value)) {
      result[field.id] = normalizePresetData(field, value, types);
    } else if (
      field.type === 'oneof' &&
      isObject(value) &&
      typeof value._type === 'string' &&
      types
    ) {
      const sub = types[value._type];
      if (sub) {
        result[field.id] = normalizePresetData(sub, value, types);
      }
    }
  });
  return result;
}

function normalizeArrayItem(
  itemField: ObjectLikeField,
  item: any,
  types?: Record<string, Schema>
): any {
  if (!isObject(item)) {
    return item;
  }
  if (itemField.type === 'object') {
    return normalizePresetData(itemField, item, types);
  }
  if (itemField.type === 'oneof' && typeof item._type === 'string' && types) {
    const sub = types[item._type];
    if (sub) {
      return normalizePresetData(sub, item, types);
    }
  }
  return item;
}
