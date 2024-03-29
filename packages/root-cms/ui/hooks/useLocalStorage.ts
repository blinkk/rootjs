import {StateUpdater, useState} from 'preact/hooks';

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      console.error(err);
      return defaultValue;
    }
  });
  const setValue: StateUpdater<T> = (value) => {
    if (typeof value === 'function') {
      const fn = value as (currentValue: T) => T;
      value = fn(storedValue);
    }
    window.localStorage.setItem(key, JSON.stringify(value));
    setStoredValue(value);
  };
  return [storedValue, setValue] as const;
}
