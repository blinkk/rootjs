/**
 * Helpers for keeping the doc editor's preview iframes in sync when multiple
 * viewports are shown side by side.
 *
 * Each viewport is an independent iframe, so a url change within one pane (a
 * link click, a hash change, an SPA route change) only affects that pane. The
 * panes are meant to show the same page at different viewport sizes, so a url
 * change in any pane is mirrored to the others.
 *
 * The url math and the "which pane navigated" decision live here so they can be
 * unit tested without live iframes.
 */

/** The parts of a location used for syncing. */
export interface UrlParts {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Query param the CMS adds to preview urls to enforce draft-preview mode (see
 * `loginRequired()` in core/plugin.ts). The CMS puts it on every pane's src,
 * but a link clicked inside the preview generally won't carry it, so it's
 * ignored when comparing panes and re-added when navigating them.
 */
const PREVIEW_PARAM = 'preview';

/**
 * Returns a comparable key for a preview iframe location: its pathname, search
 * params (minus the CMS's own `preview` param) and hash. Two panes showing the
 * same page share the same key even when only one of them was navigated by the
 * CMS.
 */
export function getPreviewUrlKey(loc: UrlParts): string {
  const params = new URLSearchParams(loc.search);
  params.delete(PREVIEW_PARAM);
  const search = params.toString();
  return `${loc.pathname}${search ? `?${search}` : ''}${loc.hash}`;
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
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

/** Returns the path portion of a url key, without its search params or hash. */
export function getPreviewPathFromUrlKey(urlKey: string): string {
  return urlKey.split('#')[0].split('?')[0];
}

/** A preview pane's current and last-known url state. */
export interface PreviewPaneState {
  /** The pane's slot index. */
  slot: number;
  /**
   * The pane's current url key, or `null` when the location can't be read
   * (the pane is still loading, or the user navigated it cross-origin).
   */
  urlKey: string | null;
  /**
   * The url key the pane was last observed at, or last navigated to by the CMS.
   */
  lastUrlKey: string | null;
}

/** A navigation to apply across the preview panes. */
export interface PreviewSyncUpdate {
  /** The url key every pane should be showing. */
  urlKey: string;
  /** Slots that need to be navigated to `urlKey`. */
  slots: number[];
}

/**
 * Returns the navigation to apply when a pane has changed url, or `null` when
 * no pane changed.
 *
 * The first pane whose current url differs from its last-known url is treated
 * as the source of the change. Every other pane is navigated to match, except
 * ones already showing that url (or already sent there, which covers panes
 * that are mid-load and can't be read yet).
 */
export function getPreviewSyncUpdate(
  panes: PreviewPaneState[]
): PreviewSyncUpdate | null {
  const source = panes.find(
    (pane) => pane.urlKey !== null && pane.urlKey !== pane.lastUrlKey
  );
  if (!source || source.urlKey === null) {
    return null;
  }
  const urlKey = source.urlKey;
  const slots = panes
    .filter(
      (pane) =>
        pane.slot !== source.slot &&
        pane.urlKey !== urlKey &&
        pane.lastUrlKey !== urlKey
    )
    .map((pane) => pane.slot);
  return {urlKey, slots};
}
