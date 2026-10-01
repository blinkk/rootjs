import {useEffect} from 'preact/hooks';

/**
 * Sets the document title for the current page. The title format is:
 * "<page> – <site name> – Root.js" or "<site name> – Root.js" if no page
 * title is provided. When `minimalBranding` is enabled, the "Root.js" portion
 * is omitted.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    const config = window.__ROOT_CTX?.rootConfig;
    const siteName = config?.projectName || 'Root.js';
    const suffix = config?.minimalBranding ? siteName : `${siteName} – Root.js`;
    document.title = title ? `${title} – ${suffix}` : suffix;
  }, [title]);
}
