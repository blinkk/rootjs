import {SaveState} from '../hooks/useDraftDoc.js';

/**
 * Lifecycle messages posted from the headless (embedded) pages (the doc
 * editor and the Root AI panel) to the parent window that frames them. All
 * messages are namespaced under `root` to avoid colliding with the
 * un-namespaced `{scrollToDeeplink}` / `{highlightNode}` messages used by the
 * in-CMS preview channel.
 */
export interface RootEmbedMessage {
  root: {
    /** The lifecycle event type. */
    type: 'ready' | 'saved' | 'published' | 'error';
    /** The doc being edited, e.g. "Pages/about" (when applicable). */
    docId?: string;
    /** Current save state (included on `saved`). */
    saveState?: SaveState;
    /** Epoch millis the doc was published (included on `published`). */
    publishedAt?: number;
    /** Error message (included on `error`). */
    error?: string;
  };
}

/**
 * Returns the origins allowed to embed the CMS, as configured via
 * `allowedIframeOrigins` in the CMS plugin config.
 */
export function getAllowedEmbedOrigins(): string[] {
  return window.__ROOT_CTX.allowedIframeOrigins || [];
}

/**
 * Returns whether a postMessage `event.origin` is allowed to communicate with
 * the editor. Same-origin messages are always allowed (the in-CMS preview
 * iframe is same-origin); cross-origin messages must match a configured
 * `allowedIframeOrigins` entry.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) {
    return false;
  }
  if (origin === window.location.origin) {
    return true;
  }
  return getAllowedEmbedOrigins().includes(origin);
}

/**
 * Returns the origin of the parent that framed this page (from the referrer),
 * or an empty string when unavailable.
 */
function getReferrerOrigin(): string {
  if (!document.referrer) {
    return '';
  }
  try {
    return new URL(document.referrer).origin;
  } catch {
    return '';
  }
}

/**
 * Posts a lifecycle message to the parent window. Messages are targeted at the
 * configured allowed origins (never `'*'`), so a session-bearing editor never
 * leaks document content or events to an arbitrary parent. When no origins are
 * configured, falls back to the referrer origin; if that is also unavailable,
 * the message is dropped.
 */
export function postToParent(payload: RootEmbedMessage['root']) {
  if (window.parent === window) {
    return;
  }
  const message: RootEmbedMessage = {root: payload};
  const targets = getAllowedEmbedOrigins();
  if (targets.length === 0) {
    const referrerOrigin = getReferrerOrigin();
    if (referrerOrigin) {
      window.parent.postMessage(message, referrerOrigin);
    }
    return;
  }
  targets.forEach((origin) => {
    window.parent.postMessage(message, origin);
  });
}
