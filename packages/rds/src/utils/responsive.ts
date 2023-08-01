export type ResponsiveValue<T> = {
  mobile?: T;
  tablet?: T;
  desktop?: T;
  default?: T;
};

export type ResponsiveType<T> = T | ResponsiveValue<T>;

export function getResponsiveValue<T>(value: ResponsiveType<T>) {
  if (typeof value === 'object') {
    const valueMap = value as ResponsiveValue<T>;
    return {
      mobile: valueMap.mobile || valueMap.default,
      tablet: valueMap.tablet || valueMap.default,
      desktop: valueMap.desktop || valueMap.default,
      default: valueMap.default || valueMap.default,
    };
  }
  return {
    mobile: value,
    tablet: value,
    desktop: value,
    default: value,
  };
}
