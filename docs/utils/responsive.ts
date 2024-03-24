export type ResponsiveValue<T> = {
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  default?: T;
};

export type ResponsiveType<T> = T | ResponsiveValue<T>;

export function getResponsiveValue<T>(value: ResponsiveType<T>) {
  if (typeof value === 'object') {
    return value as ResponsiveValue<T>;
  }
  return {
    default: value,
  };
}
