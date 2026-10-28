import type {Ref} from 'preact';
import {useCallback} from 'preact/hooks';

/**
 * Combines a component's own ref with the one forwarded to it, so both see
 * the DOM node.
 *
 * ```tsx
 * const innerRef = useRef<HTMLInputElement>(null);
 * const setRefs = useMergedRef(innerRef, forwardedRef);
 * <input ref={setRefs} />
 * ```
 */
export function useMergedRef<T>(
  local: {current: T | null},
  forwarded: Ref<T> | undefined
) {
  return useCallback(
    (node: T | null) => {
      local.current = node;
      if (typeof forwarded === 'function') {
        forwarded(node);
      } else if (forwarded) {
        forwarded.current = node;
      }
    },
    [local, forwarded]
  );
}
