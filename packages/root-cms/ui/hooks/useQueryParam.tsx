import {useState, useEffect, useCallback} from 'preact/hooks';

interface UseQueryParamOptions<T> {
  /** Whether to replace history entry instead of pushing new one */
  replace?: boolean;
  /** Custom serialization function for complex values */
  serialize?: (value: T) => string;
  /** Custom deserialization function for complex values */
  deserialize?: (value: string) => T;
}

type QueryParamSetter<T> = (value: T) => void;
type QueryParamHookReturn<T> = [T, QueryParamSetter<T>];

/**
 * Hook that synchronizes state with a URL query parameter.
 */
export function useQueryParam<T = string>(
  paramName: string,
  defaultValue: T,
  options: UseQueryParamOptions<T> = {}
): QueryParamHookReturn<T> {
  const {
    replace = false,
    serialize = (value: T) => String(value),
    deserialize = (value: string) => value as T,
  } = options;

  // Get initial value from URL.
  const getInitialValue = useCallback((): T => {
    if (typeof window === 'undefined') return defaultValue;

    const urlParams = new URLSearchParams(window.location.search);
    const paramValue = urlParams.get(paramName);

    return paramValue !== null ? deserialize(paramValue) : defaultValue;
  }, [paramName, defaultValue, deserialize]);

  const [value, setValue] = useState(getInitialValue);

  // Update state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paramValue = urlParams.get(paramName);
      const newValue =
        paramValue !== null ? deserialize(paramValue) : defaultValue;
      setValue(newValue);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [paramName, defaultValue, deserialize]);

  // Function to update both state and URL
  const updateParam = useCallback(
    (newValue: T) => {
      setValue(newValue);

      if (typeof window === 'undefined') return;

      const url = new URL(window.location.href);
      const serializedValue = serialize(newValue);

      if (serializedValue === String(defaultValue) || serializedValue === '') {
        // Remove parameter if it's the default value or empty
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, serializedValue);
      }

      const method = replace ? 'replaceState' : 'pushState';
      window.history[method]({}, '', url.toString());
    },
    [paramName, defaultValue, serialize, replace]
  );

  return [value, updateParam];
}

export function useStringParam(
  paramName: string,
  defaultValue: string = ''
): QueryParamHookReturn<string> {
  return useQueryParam(paramName, defaultValue);
}

export function useNumberParam(
  paramName: string,
  defaultValue: number = 0
): QueryParamHookReturn<number> {
  return useQueryParam(paramName, defaultValue, {
    serialize: (value: number) => String(value),
    deserialize: (value: string) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    },
  });
}

export function useBooleanParam(
  paramName: string,
  defaultValue: boolean = false
): QueryParamHookReturn<boolean> {
  return useQueryParam(paramName, defaultValue, {
    serialize: (value: boolean) => (value ? 'true' : 'false'),
    deserialize: (value: string) => value === 'true',
  });
}

export function useArrayParam(
  paramName: string,
  defaultValue: string[] = []
): QueryParamHookReturn<string[]> {
  return useQueryParam(paramName, defaultValue, {
    serialize: (value: string[]) =>
      Array.isArray(value) ? value.join(',') : '',
    deserialize: (value: string) =>
      value ? value.split(',').filter(Boolean) : defaultValue,
  });
}

export function useJSONParam<T = Record<string, unknown>>(
  paramName: string,
  defaultValue: T
): QueryParamHookReturn<T> {
  return useQueryParam(paramName, defaultValue, {
    serialize: (value: T) => {
      try {
        return JSON.stringify(value);
      } catch {
        return JSON.stringify(defaultValue);
      }
    },
    deserialize: (value: string) => {
      try {
        return JSON.parse(value) as T;
      } catch {
        return defaultValue;
      }
    },
  });
}
