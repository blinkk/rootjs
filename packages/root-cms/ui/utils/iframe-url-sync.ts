/**
 * Helpers for keeping an iframed sidebar tool's location in sync with the CMS
 * URL (`/cms/tools/:id`).
 *
 * The tool's sub-path is mirrored directly into the CMS path (not a query
 * param): a tool mounted at `/cms/tools/foo` whose iframe points at
 * `/myroute/foo` and navigates to `/myroute/foo/bar/?q=1#h` is reflected as
 * `/cms/tools/foo/bar/?q=1#h`. This means the iframe's sub-path (relative to
 * its base), query params, and hash survive a refresh and can be shared.
 *
 * The URL math is extracted here so it can be unit tested without a live
 * iframe: it has to handle absolute *and* relative iframe URLs, query params,
 * hashes, and iframe URLs with or without a trailing slash.
 */

/** The parts of a location that participate in sync. */
export interface UrlParts {
  pathname: string;
  search: string;
  hash: string;
}

/** Returns the CMS route prefix for a tool, e.g. `/cms/tools/foo`. */
export function cmsToolPrefix(id: string): string {
  return `/cms/tools/${id}`;
}

/** Strips trailing slashes from a path, preserving the root `/`. */
function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Returns the tool sub-path for `pathname` (the part after the iframe's base
 * path), starting with `/`, or an empty string when at the base. Returns
 * `null` when `pathname` is outside the tool's base path and can't be
 * mirrored.
 */
function getSubpath(basePath: string, pathname: string): string | null {
  const base = stripTrailingSlash(basePath);
  // Tool mounted at the domain root: the whole pathname is the sub-path.
  if (base === '/') {
    return pathname === '/' ? '' : pathname;
  }
  if (pathname === base) {
    return '';
  }
  if (pathname.startsWith(`${base}/`)) {
    // Keep the leading slash, e.g. "/bar/".
    return pathname.slice(base.length);
  }
  return null;
}

/**
 * Builds the CMS URL (relative: `pathname + search + hash`) that mirrors the
 * tool's current iframe location, or `null` when the location is outside the
 * tool's base path (and therefore can't be represented under
 * `/cms/tools/:id`).
 */
export function iframeLocationToCmsUrl(
  iframeUrl: string,
  id: string,
  loc: UrlParts
): string | null {
  let base: URL;
  try {
    base = new URL(iframeUrl, window.location.href);
  } catch {
    return null;
  }
  const subpath = getSubpath(base.pathname, loc.pathname);
  if (subpath === null) {
    return null;
  }
  return `${cmsToolPrefix(id)}${subpath}${loc.search}${loc.hash}`;
}

/**
 * Builds the iframe `src` that mirrors a CMS URL, by appending the tool
 * sub-path (from `/cms/tools/:id/...`) plus search + hash onto the iframe base
 * URL. Falls back to the configured `iframeUrl` when the CMS URL carries no
 * sub-path, search, or hash.
 */
export function cmsUrlToIframeSrc(
  iframeUrl: string,
  id: string,
  loc: UrlParts
): string {
  const prefix = cmsToolPrefix(id);
  let subpath = '';
  if (loc.pathname.startsWith(`${prefix}/`)) {
    subpath = loc.pathname.slice(prefix.length);
  }
  // Nothing to restore: use the configured iframe URL verbatim.
  if (!subpath && !loc.search && !loc.hash) {
    return iframeUrl;
  }
  try {
    const base = new URL(iframeUrl, window.location.href);
    const basePath = stripTrailingSlash(base.pathname);
    const target = new URL(base.toString());
    target.pathname =
      basePath === '/' ? subpath || '/' : `${basePath}${subpath}`;
    // The CMS URL mirrors the iframe's search/hash, so prefer it; fall back to
    // any search/hash on the configured iframe URL when the CMS URL has none.
    target.search = loc.search || base.search;
    target.hash = loc.hash || base.hash;
    return target.toString();
  } catch {
    return iframeUrl;
  }
}
