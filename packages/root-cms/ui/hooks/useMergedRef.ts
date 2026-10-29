import type {Ref, RefCallback} from 'preact';
import {useMemo} from 'preact/hooks';

/** Sets a callback or object ref. */
export function assignRef<T>(ref: Ref<T> | null | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/**
 * A stable callback ref that sets every ref passed in, e.g. a component's own
 * ref plus the one forwarded to it.
 *
 * ```tsx
 * const innerRef = useRef<HTMLInputElement>(null);
 * const setRefs = useMergedRef(innerRef, forwardedRef);
 * <input ref={setRefs} />
 * ```
 */
export function useMergedRef<T>(
  ...refs: Array<Ref<T> | null | undefined>
): RefCallback<T> {
  return useMemo(
    () => (value: T | null) => refs.forEach((ref) => assignRef(ref, value)),
    refs
  );
}
