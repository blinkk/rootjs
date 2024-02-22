export interface ArrayMap {
  [key: string]: any;
  _array: string[];
}

/**
 * Converts an array of objects to a map, where the keys are random and the
 * array order is preserved through the `_array` field.
 */
export function toArrayMap(arr: any[]): ArrayMap {
  const arrayMap: ArrayMap = {_array: []};
  arr.forEach((item) => {
    const key = arrayKey();
    arrayMap._array.push(key);
    arrayMap[key] = item;
  });
  return arrayMap;
}

export function arrayKey() {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  for (let i = 0; i < 6; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * charsLength)));
  }
  return result.join('');
}
