/** Returns true if any module in `value`, at any depth, has the given type. */
export function hasModule(value: unknown, type: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasModule(item, type));
  }
  if (value && typeof value === 'object') {
    if ((value as {_type?: string})._type === type) {
      return true;
    }
    return Object.values(value).some((item) => hasModule(item, type));
  }
  return false;
}
