import {FunctionComponent} from 'preact';
import {lazy} from 'preact-iso';
import {RouteLoadError} from '../components/RouteLoadError/RouteLoadError.js';

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

export interface ImportRouteComponentOptions {
  /** Number of times to attempt the import before giving up. */
  attempts?: number;
  /** Base delay between retries (multiplied by the attempt number). */
  retryDelayMs?: number;
  /** Reloads the page. Overridable in tests. */
  reload?: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * attempted recently, resolves to a `RouteLoadError` screen instead.
 *
 * NOTE: The returned promise never rejects. preact-iso treats a promise
 * thrown during render as a suspension and only listens for it to resolve, so
 * a rejected import would otherwise leave the router suspended forever.
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
    // The page is about to reload; return a promise that never settles so the
    // router stays in its current state until the reload occurs.
    return new Promise(() => {});
  }
  return () => <RouteLoadError error={lastError} />;
}

/** Lazy-loads a named component export for use as a route component. */
export function lazyRoute<P>(
  factory: () => Promise<FunctionComponent<P>>
): FunctionComponent<P> {
  return lazy(() =>
    importRouteComponent(factory).then((component) => ({default: component}))
  ) as unknown as FunctionComponent<P>;
}
