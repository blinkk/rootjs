import {useEffect, useState} from 'preact/hooks';

/** The stylesheet that page-level stylesheets load ahead of. */
const MAIN_STYLESHEET_SELECTOR = 'link[href*="/cms/static/ui.css"]';

/** The stylesheets added by this hook, keyed by href. */
const stylesheets = new Map<string, Promise<void>>();

function loadStylesheet(href: string): Promise<void> {
  let promise = stylesheets.get(href);
  if (!promise) {
    promise = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.addEventListener('load', () => resolve());
      link.addEventListener('error', () => {
        console.error(`failed to load stylesheet: ${href}`);
        // Allow retrying the next time a component needs the stylesheet.
        stylesheets.delete(href);
        link.remove();
        resolve();
      });
      // Loading ahead of ui.css means the CMS's own styles keep overriding
      // the stylesheet's.
      const main = document.querySelector(MAIN_STYLESHEET_SELECTOR);
      document.head.insertBefore(link, main);
    });
    stylesheets.set(href, promise);
  }
  return promise;
}

/**
 * Loads a stylesheet that's too large to ship in `ui.css` and returns whether
 * it has settled. A failure also counts as settled, so that the page still
 * renders, just unstyled.
 */
export function useStylesheet(href: string): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadStylesheet(href).then(() => {
      if (!cancelled) {
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [href]);
  return loaded;
}
