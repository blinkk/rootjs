import {useCallback, useEffect, useState} from 'preact/hooks';

/**
 * A hook to manage a query parameter in the URL.
 *
 * The query param can be a single value or an array of values.
 *
 * If the value is the same as the default value, the query param is cleared
 * from the URL.
 */
export function useQueryParam<T extends string | string[]>(
  paramName: string,
  defaultValue: T
): [T, (newValue: T | ((currentValue: T) => T)) => void] {
  const getParamValue = useCallback((): T => {
    const urlParams = new URLSearchParams(window.location.search);
    if (Array.isArray(defaultValue)) {
      const allParams = urlParams.getAll(paramName);
      if (allParams.length > 0) {
        // Filter params to only include valid values from the default array.
        const validParams = allParams.filter((param) =>
          (defaultValue as string[]).includes(param)
        );
        if (validParams.length > 0) {
          return validParams as T;
        }
      }
    } else {
      const paramValue = urlParams.get(paramName);
      if (paramValue) {
        return paramValue as T;
      }
    }
    return defaultValue;
  }, [paramName, defaultValue]);

  const [value, setValue] = useState<T>(getParamValue());

  const setParamValue = useCallback(
    (newValue: T | ((currentValue: T) => T)) => {
      const nextValue =
        typeof newValue === 'function'
          ? (newValue as (currentValue: T) => T)(value)
          : newValue;

      setValue(nextValue);

      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete(paramName);

      const defaultValueStr = JSON.stringify(defaultValue);
      const nextValueStr = JSON.stringify(nextValue);

      if (defaultValueStr !== nextValueStr) {
        if (Array.isArray(nextValue)) {
          nextValue.forEach((val) => {
            newUrl.searchParams.append(paramName, String(val));
          });
        } else {
          newUrl.searchParams.set(paramName, String(nextValue));
        }
      }

      window.history.replaceState({}, '', newUrl.toString());
    },
    [paramName, defaultValue, value]
  );

  useEffect(() => {
    const onPopState = () => {
      setValue(getParamValue());
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [getParamValue]);

  return [value, setParamValue];
}
