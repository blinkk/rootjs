/**
 * Helpers for keeping an iframed sidebar tool's location in sync with the CMS
 * URL (`/cms/tools/:id`). The URL math is extracted here so it can be unit
 * tested without a live iframe: it has to handle absolute *and* relative iframe
 * URLs, query params, hashes, and iframe URLs with or without a trailing slash.
 */

/**
 * Query param on the CMS tool URL that stores the iframe's current location as
 * an origin-relative `pathname + search + hash`. Mirroring the iframe's
 * location here keeps the address bar in sync with where the user is inside the
 * tool, so the path survives a refresh and can be shared.
 */
export const IFRAME_PATH_PARAM = 'path';

/** Returns the origin-relative `pathname + search + hash` of a URL. */
export function getRelativePath(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Normalizes a URL for comparison by stripping a trailing slash from the
 * pathname, so `https://x/tool` and `https://x/tool/` compare equal.
 */
function normalizeHref(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.origin}${pathname}${url.search}${url.hash}`;
}

/** Reads the stored iframe sub-path from a CMS URL's query string. */
export function getStoredIframePath(search: string): string {
  return new URLSearchParams(search).get(IFRAME_PATH_PARAM) || '';
}

/**
 * Resolves the iframe's initial `src` by restoring a stored sub-path onto the
 * tool's base URL. Works whether `iframeUrl` is absolute or relative and
 * regardless of a trailing slash; falls back to `iframeUrl` when inputs are
 * empty or malformed.
 */
export function resolveInitialSrc(
  iframeUrl: string,
  storedPath: string
): string {
  if (!storedPath) {
    return iframeUrl;
  }
  try {
    const base = new URL(iframeUrl, window.location.href);
    // `storedPath` is origin-relative, so resolve it against the tool's origin
    // to reconstruct the full URL the user was last on.
    return new URL(storedPath, base.origin).toString();
  } catch {
    return iframeUrl;
  }
}

/**
 * Computes the value to store in the CMS URL `path` param for the tool's
 * current `relativePath`, or `null` when the tool is at its home location (so
 * the param can be dropped to keep the URL clean). Comparing fully-resolved
 * URLs means a trailing-slash difference between the configured `iframeUrl` and
 * the loaded location is treated as the same home location.
 */
export function computeStoredPath(
  iframeUrl: string,
  relativePath: string
): string | null {
  if (!relativePath) {
    return null;
  }
  try {
    const base = new URL(iframeUrl, window.location.href);
    const current = new URL(relativePath, base.origin);
    if (normalizeHref(current) === normalizeHref(base)) {
      return null;
    }
  } catch {
    // Fall through and store the raw relativePath.
  }
  return relativePath;
}
