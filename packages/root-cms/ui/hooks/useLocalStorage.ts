import {StateUpdater, useState} from 'preact/hooks';
import {useCallback} from 'preact/hooks';

export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: StateUpdater<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      console.error(err);
      return defaultValue;
    }
  });
  const setValue = useCallback(
    (value: StateUpdater<T>) => {
      setStoredValue((prev) => {
        const resolved =
          typeof value === 'function'
            ? (value as (currentValue: T) => T)(prev)
            : value;
        window.localStorage.setItem(key, JSON.stringify(resolved));
        return resolved;
      });
    },
    [key]
  );
  return [storedValue, setValue] as const;
}
