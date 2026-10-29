import {StateUpdater, useCallback, useEffect, useState} from 'preact/hooks';

/** Event dispatched on `window` when a value is written in this tab. */
const CHANGE_EVENT = 'root-cms:local-storage';

interface ChangeDetail {
  key: string;
  value: unknown;
}

function readValue<T>(key: string, defaultValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.error(err);
    return defaultValue;
  }
}

/**
 * State persisted to `localStorage` as JSON. Every hook instance using the
 * same key stays in sync, both within the tab and across tabs.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: StateUpdater<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() =>
    readValue(key, defaultValue)
  );

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ChangeDetail>).detail;
      if (detail.key === key) {
        setStoredValue(detail.value as T);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setStoredValue(readValue(key, defaultValue));
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const setValue = useCallback(
    (value: StateUpdater<T>) => {
      setStoredValue((prev) => {
        const resolved =
          typeof value === 'function'
            ? (value as (currentValue: T) => T)(prev)
            : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch (err) {
          console.error(err);
        }
        // Notify other instances after this update settles.
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent<ChangeDetail>(CHANGE_EVENT, {
              detail: {key, value: resolved},
            })
          );
        });
        return resolved;
      });
    },
    [key]
  );
  return [storedValue, setValue] as const;
}
