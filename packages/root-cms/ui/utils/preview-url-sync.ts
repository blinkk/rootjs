/**
 * Helpers for keeping the doc editor's preview iframes in sync when multiple
 * viewports are shown side by side.
 *
 * Each viewport is an independent iframe, so a page load within one pane (a
 * link click, a form submit) only affects that pane. The panes are meant to
 * show the same page at different viewport sizes, so the url of a page loaded
 * in any pane is mirrored to the others.
 *
 * Only the path and query params participate in syncing. Client-side url
 * changes (history state changes, hash changes) are deliberately left alone:
 * they're page-local state, not a navigation to a different page.
 *
 * The url math lives here so it can be unit tested without live iframes.
 */

/** The parts of a location used for syncing. */
export interface UrlParts {
  pathname: string;
  search: string;
}

/**
 * Query param the CMS adds to preview urls to enforce draft-preview mode (see
 * `loginRequired()` in core/plugin.ts). The CMS puts it on every pane's src,
 * but a link clicked inside the preview generally won't carry it, so it's
 * ignored when comparing panes and re-added when navigating them.
 */
const PREVIEW_PARAM = 'preview';

/**
 * Query params used by the CMS UI itself (e.g. the locale selector, modals,
 * field deeplinks) that should never be passed through to the previewed page.
 */
const CMS_INTERNAL_PARAMS = ['locale', 'modal', 'deeplink'];

/**
 * Builds the query string for a preview url from the CMS page's current search
 * string. `preview=true` is always the first param so the url stays stable and
 * readable (e.g. when opened in a new tab), and CMS-internal params are
 * stripped so only params meant for the previewed page pass through.
 *
 * Returns the query string without a leading `?`, e.g. `preview=true&debug=1`.
 */
export function getPreviewSearch(search: string): string {
  const cmsParams = new URLSearchParams(search);
  const params = new URLSearchParams();
  params.set(PREVIEW_PARAM, 'true');
  cmsParams.forEach((value, key) => {
    if (key === PREVIEW_PARAM || CMS_INTERNAL_PARAMS.includes(key)) {
      return;
    }
    params.append(key, value);
  });
  return params.toString();
}

/**
 * Returns a comparable key for a preview iframe location: its pathname plus
 * search params, minus the CMS's own `preview` param. Two panes showing the
 * same page share the same key even when only one of them was navigated by the
 * CMS.
 */
export function getPreviewUrlKey(loc: UrlParts): string {
  const params = new URLSearchParams(loc.search);
  params.delete(PREVIEW_PARAM);
  const search = params.toString();
  return `${loc.pathname}${search ? `?${search}` : ''}`;
}

/**
 * Returns the url key for an iframe url (absolute or relative to the CMS
 * origin), or `null` for urls that aren't a previewable page (e.g.
 * `about:blank`) or that point to a different origin.
 */
export function getPreviewUrlKeyFromUrl(url: string): string | null {
  if (!url || url.startsWith('about:blank')) {
    return null;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }
    return getPreviewUrlKey(parsed);
  } catch {
    return null;
  }
}

/**
 * Builds the iframe `src` for a url key, re-adding the `preview=true` param
 * that {@link getPreviewUrlKey} strips.
 */
export function getPreviewSrcFromUrlKey(urlKey: string): string {
  const url = new URL(urlKey, window.location.origin);
  url.searchParams.set(PREVIEW_PARAM, 'true');
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/** Returns the path portion of a url key, without its search params. */
export function getPreviewPathFromUrlKey(urlKey: string): string {
  return urlKey.split('?')[0];
}
