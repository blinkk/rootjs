import {useState, useEffect, useCallback, useRef} from 'preact/hooks';
import {useLocation} from 'preact-iso';

interface UseQueryParamOptions<T> {
  /** Whether to replace history entry instead of pushing new one. */
  replace?: boolean;
  /** Custom serialization function for complex values. */
  serialize?: (value: T) => string;
  /** Custom deserialization function for complex values. */
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
  const {query, route} = useLocation();
  const {
    replace = false,
    serialize = (value: T) => String(value),
    deserialize = (value: string) => value as T,
  } = options;

  // Use refs for values that shouldn't trigger re-renders when their
  // reference changes (e.g. new array/function refs passed each render).
  const defaultValueRef = useRef(defaultValue);
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  defaultValueRef.current = defaultValue;
  serializeRef.current = serialize;
  deserializeRef.current = deserialize;

  // Get value from URL query params.
  const getValueFromQuery = useCallback((): T => {
    const paramValue = query[paramName] as string | undefined;
    return paramValue !== undefined
      ? deserializeRef.current(paramValue)
      : defaultValueRef.current;
  }, [query, paramName]);

  const [value, setValue] = useState(getValueFromQuery);

  // Update state when URL changes (via useLocation's query object).
  useEffect(() => {
    setValue(getValueFromQuery());
  }, [getValueFromQuery]);

  // Function to update both state and URL.
  const updateParam = useCallback(
    (newValue: T) => {
      setValue(newValue);

      const url = new URL(window.location.href);
      const serializedValue = serializeRef.current(newValue);

      if (
        serializedValue === String(defaultValueRef.current) ||
        serializedValue === ''
      ) {
        // Remove parameter if it's the default value or empty.
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, serializedValue);
      }

      // Use preact-iso's route() so LocationProvider stays in sync.
      const newUrl = url.pathname + url.search;
      route(newUrl, replace);
    },
    [paramName, replace, route]
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
