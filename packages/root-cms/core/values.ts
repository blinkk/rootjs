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

  // Numeric segments are array positions, so they can only be used on an array
  // and can't leave gaps. Writing one to an object would store it as a key.
  const assertKey = (key: string) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Invalid path "${path}": reserved key "${key}".`);
    }
    if (!/^\d+$/.test(key)) {
      return;
    }
    if (!Array.isArray(current)) {
      throw new Error(
        `Invalid path "${path}": "${key}" is an array index, but the value it applies to is not an array.`
      );
    }
    if (Number(key) > current.length) {
      throw new Error(
        `Invalid path "${path}": index ${key} is out of range, the array has ${current.length} items.`
      );
    }
  };

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    assertKey(key);

    // Check if next key is an array index.
    const isNextKeyArrayIndex = /^\d+$/.test(nextKey);

    if (!(key in current)) {
      // Create object or array based on next key.
      current[key] = isNextKeyArrayIndex ? [] : {};
    }

    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  assertKey(lastKey);
  current[lastKey] = value;
}
