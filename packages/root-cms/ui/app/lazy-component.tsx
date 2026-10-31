import {ComponentChildren, FunctionComponent} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {Button} from '../primitives/Button/Button.js';
import {Spinner} from '../primitives/Spinner/Spinner.js';
import {importWithRetry, ImportWithRetryOptions} from './lazy-route.js';

export interface LazyComponentOptions extends ImportWithRetryOptions {
  /** Rendered while the component loads. Defaults to a centered spinner. */
  fallback?: ComponentChildren;
}

/** A lazy-loaded component that can start loading before it's rendered. */
export interface LazyComponent<P> extends FunctionComponent<P> {
  /** Starts the import. Resolves once it's loaded, rejects if it fails. */
  preload: () => Promise<void>;
}

/**
 * Lazy-loads a component that renders within a page, e.g. a modal or a side
 * panel. Unlike `lazyRoute()`, a failed import never reloads the page, since
 * the user may have unsaved changes. It renders an inline error with a retry
 * button instead, and doesn't rely on an error boundary because modals render
 * outside of the app's error boundary.
 */
export function lazyComponent<P>(
  factory: () => Promise<FunctionComponent<P>>,
  options?: LazyComponentOptions
): LazyComponent<P> {
  let component: FunctionComponent<P> | null = null;
  let promise: Promise<FunctionComponent<P>> | null = null;

  function load(): Promise<FunctionComponent<P>> {
    if (!promise) {
      promise = importWithRetry(factory, options).then(
        (c) => {
          component = c;
          return c;
        },
        (err) => {
          // Don't cache failures; the next attempt retries the import.
          promise = null;
          throw err;
        }
      );
    }
    return promise;
  }

  function Lazy(props: P) {
    const [resolved, setResolved] = useState(() => ({component}));
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
      if (resolved.component) {
        return;
      }
      let cancelled = false;
      load().then(
        (c) => {
          if (!cancelled) {
            setResolved({component: c});
          }
        },
        (err) => {
          console.error('failed to lazy-load component:', err);
          if (!cancelled) {
            setFailed(true);
          }
        }
      );
      return () => {
        cancelled = true;
      };
    }, [attempt]);

    if (resolved.component) {
      const Component = resolved.component;
      return <Component {...(props as any)} />;
    }
    if (failed) {
      return (
        <div
          className="LazyComponent__error flex flex-col items-center gap-3 p-6 text-center text-base text-muted"
          role="alert"
        >
          <p>
            This failed to load. Try again, or reload the page if the problem
            continues.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      );
    }
    return (
      options?.fallback ?? (
        <div className="LazyComponent__loading flex items-center justify-center p-6">
          <Spinner />
        </div>
      )
    );
  }

  Lazy.preload = () => load().then(() => undefined);
  return Lazy;
}
