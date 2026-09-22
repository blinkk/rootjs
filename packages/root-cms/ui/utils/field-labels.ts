import * as schema from '../../core/schema.js';

export interface FieldPathSegment {
  /** Human-readable label for the segment. */
  label: string;
  /** Deep key up to and including this segment. */
  deepKey: string;
}

export interface ResolvedFieldPath {
  /** Labels for each segment of the path, from the root down to the field. */
  segments: FieldPathSegment[];
  /** The schema field the deep key resolves to, if found. */
  field?: schema.Field;
}

/** Separator used when joining field path labels for display. */
export const FIELD_PATH_SEPARATOR = ' › ';

/**
 * Resolves a deep key (e.g. `fields.sections.k1a2.title`) against a
 * collection schema, returning a human-readable label for each segment.
 * Array items are labelled by their 1-based position, which requires the
 * current doc value to be available via `getValue`. One-of fields are
 * resolved using the `_type` stored in the doc value. Unknown segments fall
 * back to the raw key so partial paths still render sensibly.
 */
export function resolveFieldPath(
  collection: schema.Collection | null | undefined,
  deepKey: string,
  getValue?: (deepKey: string) => any
): ResolvedFieldPath {
  const segments: FieldPathSegment[] = [];
  const parts = deepKey.split('.');
  if (parts[0] === 'fields') {
    parts.shift();
  }
  const types: Record<string, schema.Schema> = collection?.types || {};
  let fields: schema.FieldWithId[] | null = collection?.fields || null;
  let currentKey = 'fields';
  let field: schema.Field | undefined;
  // Set when the next segment is an array item key rather than a field id.
  let arrayField: schema.ArrayField | null = null;

  for (const part of parts) {
    currentKey = `${currentKey}.${part}`;

    if (arrayField) {
      const label = getArrayItemLabel(currentKey, part, getValue);
      segments.push({label, deepKey: currentKey});
      const item = resolveObjectLike(
        arrayField.of,
        currentKey,
        types,
        getValue
      );
      fields = item.fields;
      field = item.field;
      arrayField = null;
      continue;
    }

    const match = fields?.find((f) => f.id === part);
    if (!match) {
      segments.push({label: part, deepKey: currentKey});
      fields = null;
      field = undefined;
      continue;
    }
    field = match;
    segments.push({
      label: match.label || match.id || part,
      deepKey: currentKey,
    });
    if (match.type === 'array') {
      arrayField = match;
      fields = null;
    } else {
      const resolved = resolveObjectLike(match, currentKey, types, getValue);
      fields = resolved.fields;
    }
  }

  return {segments, field};
}

/** Joins the resolved path labels for display, e.g. `Sections › #2 › Title`. */
export function formatFieldPath(
  collection: schema.Collection | null | undefined,
  deepKey: string,
  getValue?: (deepKey: string) => any
): string {
  const {segments} = resolveFieldPath(collection, deepKey, getValue);
  return segments.map((s) => s.label).join(FIELD_PATH_SEPARATOR);
}

/**
 * Returns the label for an array item, e.g. `#2`, using the item's position
 * in the array's `_array` key order. Falls back to the raw item key when the
 * value isn't available.
 */
function getArrayItemLabel(
  itemDeepKey: string,
  itemKey: string,
  getValue?: (deepKey: string) => any
): string {
  const arrayDeepKey = itemDeepKey.slice(0, -(itemKey.length + 1));
  const arrayValue = getValue?.(arrayDeepKey);
  const order: unknown = arrayValue?._array;
  if (Array.isArray(order)) {
    const index = order.indexOf(itemKey);
    if (index >= 0) {
      return `#${index + 1}`;
    }
  }
  return itemKey;
}

/**
 * Resolves the child fields of an object-like field (object or one-of).
 * One-of fields look up the selected type via the doc value's `_type`.
 */
function resolveObjectLike(
  field: schema.Field | undefined,
  deepKey: string,
  types: Record<string, schema.Schema>,
  getValue?: (deepKey: string) => any
): {fields: schema.FieldWithId[] | null; field?: schema.Field} {
  if (!field) {
    return {fields: null};
  }
  if (field.type === 'object') {
    return {fields: field.fields || [], field};
  }
  if (field.type === 'oneof') {
    const value = getValue?.(deepKey);
    const typeName = value?._type;
    const typeSchema = typeName ? types[typeName] : undefined;
    if (typeSchema) {
      return {fields: typeSchema.fields || [], field};
    }
    // Fall back to any inline schema definitions on the field.
    const inline = Array.isArray(field.types)
      ? (field.types as Array<schema.Schema | string>).find(
          (t): t is schema.Schema =>
            typeof t !== 'string' && t.name === typeName
        )
      : undefined;
    return {fields: inline?.fields || null, field};
  }
  return {fields: null, field};
}
