import {useCallback, useRef, useState} from 'preact/hooks';

/**
 * State that a parent can control (`value` set) or leave to the component
 * (`value` undefined, starting from `defaultValue`). `onChange` is called on
 * every change either way. Overlays use it for `open`/`defaultOpen`/
 * `onOpenChange`.
 *
 * ```ts
 * const [open, setOpen] = useControllableState(
 *   props.open,
 *   props.defaultOpen ?? false,
 *   props.onOpenChange
 * );
 * ```
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void
): [T, (value: T) => void] {
  const [internal, setInternal] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) {
        setInternal(next);
      }
      onChangeRef.current?.(next);
    },
    [controlled]
  );

  return [controlled ? value : internal, setValue];
}
