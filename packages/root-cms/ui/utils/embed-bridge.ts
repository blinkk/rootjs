import {RootEmbedMessage} from '../../shared/embed-protocol.js';

export type {RootEmbedMessage} from '../../shared/embed-protocol.js';

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
 * Posts a lifecycle message to the window that framed this page: the parent
 * window when iframed, or the opener when opened as a pop-up via
 * `window.open()`. Messages are targeted at the configured allowed origins
 * (never `'*'`), so a session-bearing editor never leaks document content or
 * events to an arbitrary parent. When no origins are configured, falls back
 * to the referrer origin; if that is also unavailable, the message is
 * dropped.
 */
export function postToParent(payload: RootEmbedMessage['root']) {
  const target: Window | null =
    window.parent !== window ? window.parent : window.opener;
  if (!target) {
    return;
  }
  const message: RootEmbedMessage = {root: payload};
  const targets = getAllowedEmbedOrigins();
  if (targets.length === 0) {
    const referrerOrigin = getReferrerOrigin();
    if (referrerOrigin) {
      target.postMessage(message, referrerOrigin);
    }
    return;
  }
  targets.forEach((origin) => {
    target.postMessage(message, origin);
  });
}
