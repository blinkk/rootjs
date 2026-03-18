/** @fileoverview Utility for extracting reference doc IDs from document data. */

/**
 * Recursively walks a document's fields data and extracts all reference doc
 * IDs. References are stored as objects with `{id, collection, slug}`.
 */
export function extractReferenceDocIds(data: any): string[] {
  const ids = new Set<string>();
  walk(data, ids);
  return Array.from(ids);
}

function walk(value: any, ids: Set<string>) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, ids);
    }
    return;
  }

  // Check if this object looks like a reference value.
  if (isReferenceValue(value)) {
    ids.add(value.id);
    return;
  }

  // Recurse into object properties.
  for (const key of Object.keys(value)) {
    walk(value[key], ids);
  }
}

/** Checks if an object matches the reference value shape `{id, collection, slug}`. */
function isReferenceValue(obj: any): obj is {id: string; collection: string; slug: string} {
  return (
    typeof obj.id === 'string' &&
    typeof obj.collection === 'string' &&
    typeof obj.slug === 'string' &&
    obj.id.includes('/')
  );
}
