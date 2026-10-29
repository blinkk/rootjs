import {useEffect, useState} from 'preact/hooks';

/**
 * Whether a CSS media query matches, updated as it changes.
 *
 * ```ts
 * const isDesktop = useMediaQuery('(width >= 48rem)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : true
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
