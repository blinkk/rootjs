export function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

/**
 * Recursively sets data to an object using dot notation, e.g.
 * ```
 * setDeepKey({}, 'foo.bar', 'value');
 * // => {foo: {bar: 'value'}}
 * ```
 */
export function setDeepKey(data: any, deepKey: string, value: any) {
  if (deepKey.includes('.')) {
    const [head, tail] = splitKey(deepKey);
    data[head] ??= {};
    setDeepKey(data[head], tail, value);
  } else {
    const key = deepKey;
    if (typeof value === 'undefined') {
      delete data[key];
    } else {
      data[key] = value;
    }
  }
  return data;
}

function splitKey(key: string) {
  const index = key.indexOf('.');
  const head = key.substring(0, index);
  const tail = key.substring(index + 1);
  return [head, tail] as const;
}
