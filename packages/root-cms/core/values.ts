/**
 * Sets a value at a JSON path in an object.
 * Supports dot notation for nested objects and array indices.
 * Examples:
 *   setValueAtPath(obj, 'title', 'New Title')
 *   setValueAtPath(obj, 'hero.title', 'New Title')
 *   setValueAtPath(obj, 'content.0.text', 'First item')
 */
export function setValueAtPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];

    // Check if next key is an array index.
    const isNextKeyArrayIndex = /^\d+$/.test(nextKey);

    if (!(key in current)) {
      // Create object or array based on next key.
      current[key] = isNextKeyArrayIndex ? [] : {};
    }

    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}
