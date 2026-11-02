/** Returns true if a link should be handled by the CMS SPA router. */
export function isCmsInternalUrl(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    return (
      url.origin === window.location.origin &&
      (url.pathname === '/cms' || url.pathname.startsWith('/cms/'))
    );
  } catch {
    return false;
  }
}
