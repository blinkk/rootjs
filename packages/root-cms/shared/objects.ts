export function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}
