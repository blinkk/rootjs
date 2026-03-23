import {useEffect} from 'preact/hooks';

/**
 * Sets the document title for the current page. The title format is:
 * "<page> – <site name> – Root CMS" or "<site name> – Root CMS" if no page
 * title is provided. When `minimalBranding` is enabled, the "Root CMS" portion
 * is omitted.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    const config = window.__ROOT_CTX?.rootConfig;
    const siteName = config?.projectName || 'Root CMS';
    const suffix = config?.minimalBranding
      ? siteName
      : `${siteName} – Root CMS`;
    document.title = title ? `${title} – ${suffix}` : suffix;
  }, [title]);
}
