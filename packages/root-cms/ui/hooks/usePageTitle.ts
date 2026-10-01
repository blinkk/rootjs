import {useEffect} from 'preact/hooks';

/**
 * Sets the document title for the current page. The title format is:
 * "<page> – <site name>" or "<site name>" if no page title is provided.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    const config = window.__ROOT_CTX?.rootConfig;
    const siteName = config?.projectName || 'Root.js';
    document.title = title ? `${title} – ${siteName}` : siteName;
  }, [title]);
}
