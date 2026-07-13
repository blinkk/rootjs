import {FunctionComponent} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {RouteLoadError} from '../components/RouteLoadError/RouteLoadError.js';
import {RouteLoading} from '../components/RouteLoading/RouteLoading.js';

/** Number of times to attempt a route import before giving up. */
const ROUTE_IMPORT_ATTEMPTS = 3;

/** Base delay between route import retries (multiplied by attempt number). */
const ROUTE_IMPORT_RETRY_DELAY_MS = 250;

/**
 * Storage key holding the timestamp of the last automatic reload triggered by
 * a route import failure, used to guard against reload loops.
 */
export const ROUTE_IMPORT_RELOAD_KEY = 'root::lazyRoute::reloadedAt';

/** Minimum time between automatic reloads triggered by route import failures. */
const ROUTE_IMPORT_RELOAD_INTERVAL_MS = 60 * 1000;

/**
 * Time to wait after triggering an automatic reload before falling back to
 * the error screen. The reload may never happen (e.g. it can be blocked by an
 * unsaved-changes prompt), in which case the route would otherwise be stuck
 * on the loading screen forever.
 */
const ROUTE_IMPORT_RELOAD_GRACE_MS = 10 * 1000;

export interface ImportRouteComponentOptions {
  /** Number of times to attempt the import before giving up. */
  attempts?: number;
  /** Base delay between retries (multiplied by the attempt number). */
  retryDelayMs?: number;
  /** Reloads the page. Overridable in tests. */
  reload?: () => void;
}

export interface LazyRouteOptions extends ImportRouteComponentOptions {
  /**
   * Whether the loading screen renders within the app frame (topbar,
   * sidebar). Defaults to true. Disable for routes that render outside the
   * frame, e.g. the embedded pages.
   */
  frame?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Marker used to identify the error screen component returned by
 * `importRouteComponent()` so `lazyRoute()` can avoid caching failures.
 */
const ROUTE_LOAD_ERROR_MARKER = Symbol('RouteLoadError');

function routeLoadErrorComponent<P>(error: unknown): FunctionComponent<P> {
  const ErrorComponent = () => <RouteLoadError error={error} />;
  (ErrorComponent as any)[ROUTE_LOAD_ERROR_MARKER] = true;
  return ErrorComponent;
}

/** Returns true if the component is the error screen from a failed import. */
export function isRouteLoadErrorComponent(
  component: FunctionComponent<any>
): boolean {
  return Boolean((component as any)[ROUTE_LOAD_ERROR_MARKER]);
}

/**
 * Attempts a full page reload to recover from a route import failure, which
 * typically happens when the server rebuilds or redeploys and the hashed
 * chunk files referenced by the version of the app running in the browser no
 * longer exist on the server. Returns `false` without reloading if a reload
 * was already attempted recently (to avoid a reload loop) so callers can fall
 * back to an error screen instead.
 */
function reloadOnRouteImportError(reload: () => void): boolean {
  try {
    const lastReloadAt = Number(
      window.sessionStorage.getItem(ROUTE_IMPORT_RELOAD_KEY) || 0
    );
    if (Date.now() - lastReloadAt < ROUTE_IMPORT_RELOAD_INTERVAL_MS) {
      return false;
    }
    window.sessionStorage.setItem(ROUTE_IMPORT_RELOAD_KEY, String(Date.now()));
  } catch {
    // If sessionStorage is unavailable there's no way to guard against a
    // reload loop, so fall back to the error screen instead.
    return false;
  }
  reload();
  return true;
}

/**
 * Imports a route component, retrying a few times on failure. Dynamic imports
 * can fail when the server rebuilds or redeploys (the hashed chunk files
 * change), when the login session expires, or due to flaky network requests.
 * If the import still fails after all attempts, the page is automatically
 * reloaded to fetch the latest version of the CMS. If a reload was already
 * attempted recently (or the triggered reload never happens), resolves to a
 * `RouteLoadError` screen instead.
 *
 * NOTE: The returned promise never rejects; failures resolve to a component
 * that renders the error screen, so callers can render the result directly.
 */
export async function importRouteComponent<P>(
  factory: () => Promise<FunctionComponent<P>>,
  options?: ImportRouteComponentOptions
): Promise<FunctionComponent<P>> {
  const attempts = options?.attempts ?? ROUTE_IMPORT_ATTEMPTS;
  const retryDelayMs = options?.retryDelayMs ?? ROUTE_IMPORT_RETRY_DELAY_MS;
  const reload = options?.reload ?? (() => window.location.reload());
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }
  console.error('failed to import route component:', lastError);
  if (reloadOnRouteImportError(reload)) {
    // The page is about to reload; keep the loading screen up while the
    // reload happens, but fall back to the error screen if the page is still
    // alive after a grace period (e.g. the reload was blocked by an
    // unsaved-changes prompt).
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(routeLoadErrorComponent<P>(lastError));
      }, ROUTE_IMPORT_RELOAD_GRACE_MS);
    });
  }
  return routeLoadErrorComponent<P>(lastError);
}

/**
 * Lazy-loads a named component export for use as a route component. While the
 * import is pending a loading screen is rendered, and once it resolves the
 * component is cached so subsequent navigations to the route render
 * immediately without a loading state. Failed imports resolve to an error
 * screen that is NOT cached, so navigating back to the route retries the
 * import.
 */
export function lazyRoute<P>(
  factory: () => Promise<FunctionComponent<P>>,
  options?: LazyRouteOptions
): FunctionComponent<P> {
  let component: FunctionComponent<P> | null = null;
  let promise: Promise<FunctionComponent<P>> | null = null;

  function load(): Promise<FunctionComponent<P>> {
    if (component) {
      return Promise.resolve(component);
    }
    if (!promise) {
      promise = importRouteComponent(factory, options).then((c) => {
        if (isRouteLoadErrorComponent(c)) {
          // Don't cache failures; the next mount retries the import.
          promise = null;
        } else {
          component = c;
        }
        return c;
      });
    }
    return promise;
  }

  return function LazyRoute(props: P) {
    // NOTE: functions passed to `useState` are treated as lazy initializers,
    // so the component must be wrapped.
    const [resolved, setResolved] = useState<FunctionComponent<P> | null>(
      () => component
    );
    useEffect(() => {
      if (resolved) {
        return;
      }
      let cancelled = false;
      load().then((c) => {
        if (!cancelled) {
          setResolved(() => c);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []);
    if (!resolved) {
      // Start the import during render (rather than waiting for the effect)
      // so the chunk request goes out as early as possible.
      load();
      return <RouteLoading frame={options?.frame} />;
    }
    const Component = resolved;
    return <Component {...(props as any)} />;
  };
}
