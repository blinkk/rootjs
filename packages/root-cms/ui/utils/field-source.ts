import * as schema from '../../core/schema.js';
import {getDocFromCacheOrFetch} from './doc-cache.js';
import {getNestedValue} from './objects.js';

export interface FieldOption {
  value: string;
  label: string;
  /** Optional secondary help text shown beneath the label in the dropdown. */
  description?: string;
}

/**
 * Resolves the selectable values for a field from its source. Currently only a
 * CMS document source is supported (resolved from the referenced doc's field).
 */
export async function resolveFieldSource(
  source: schema.FieldValueSource
): Promise<FieldOption[]> {
  if (source && source.doc) {
    return resolveDocumentSource(source);
  }
  return [];
}

async function resolveDocumentSource(
  source: schema.DocumentSource
): Promise<FieldOption[]> {
  if (!source.doc || !source.field) {
    return [];
  }
  const rawDoc = await getDocFromCacheOrFetch(source.doc);
  if (!rawDoc) {
    return [];
  }
  const fields = rawDoc.fields || {};
  const items = toArray(getNestedValue(fields, source.field));
  const result: FieldOption[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    let rawValue: any;
    let rawLabel: any;
    let rawHelp: any;
    if (item && typeof item === 'object') {
      rawValue = source.valueKey
        ? getNestedValue(item, source.valueKey)
        : undefined;
      rawLabel = source.labelKey
        ? getNestedValue(item, source.labelKey)
        : undefined;
      rawHelp = source.helpKey
        ? getNestedValue(item, source.helpKey)
        : undefined;
    } else {
      rawValue = item;
    }
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }
    const value = String(rawValue);
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    const label =
      rawLabel === undefined || rawLabel === null || rawLabel === ''
        ? value
        : String(rawLabel);
    const description =
      rawHelp === undefined || rawHelp === null || rawHelp === ''
        ? undefined
        : String(rawHelp);
    result.push(description ? {value, label, description} : {value, label});
  }
  return result;
}

/**
 * Converts a CMS array value to a plain array. CMS arrays are stored in the
 * `{_array: [keys], <key>: <item>}` notation, so this normalizes that into an
 * ordered list. Plain arrays are returned as-is.
 */
function toArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object' && Array.isArray(value._array)) {
    return value._array
      .map((key: string) => value[key])
      .filter((item: any) => item !== undefined && item !== null);
  }
  return [];
}
