import {useEffect, useRef, useState} from 'preact/hooks';

interface StuckObserverOptions {
  offsetHeight: () => number;
}

/**
 * Provides an observer that detects when an element is "stuck" at the top of the viewport.
 */
export function useStuckObserver(options: StuckObserverOptions) {
  const ref = useRef<HTMLElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const height = options.offsetHeight();
    const elementHeight = ref.current.offsetHeight;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: `-${height + elementHeight + 2}px 0px 0px 0px`,
      }
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, []);
  return {ref, isIntersecting};
}
