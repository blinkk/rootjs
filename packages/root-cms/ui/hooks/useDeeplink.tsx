import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isScrollToDeeplinkMessage} from '../../shared/embed-protocol.js';
import {isAllowedOrigin} from '../utils/embed-bridge.js';

export interface DeeplinkContext {
  value: string;
  /** Sets the targeted field without touching the URL. */
  setValue: (value: string) => void;
  /**
   * Sets the targeted field and mirrors it into the `deeplink` URL param,
   * replacing the current history entry. Use this instead of `setValue()`
   * whenever the URL should reflect the newly targeted field.
   */
  setUrlValue: (value: string) => void;
}

interface ScrollToDeeplinkOptions {
  /** If true, will scroll to the deeplink even if the user has scrolled. */
  force?: boolean;
  /** Options for the scroll behavior. */
  behavior: 'auto' | 'smooth';
}

/** Max time to wait for a deeplinked field to render before giving up. */
const DEEPLINK_ELEMENT_TIMEOUT_MS = 3000;

/** How often to re-check for the deeplinked field while waiting for it. */
const DEEPLINK_ELEMENT_POLL_MS = 50;

function getDeeplinkFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('deeplink') || '';
}

/** Updates the `deeplink` param in the URL without adding a history entry. */
function replaceDeeplinkInUrl(deepKey: string) {
  const url = new URL(window.location.href);
  if (deepKey) {
    url.searchParams.set('deeplink', deepKey);
  } else {
    url.searchParams.delete('deeplink');
  }
  // Preserve the existing history state so the router isn't disrupted.
  window.history.replaceState(window.history.state, '', url.toString());
}

/**
 * Waits for the field element for a deep key to exist in the DOM and then
 * invokes the callback. A deeplink that arrives through a client-side URL
 * change can land before the targeted field has rendered (e.g. when the same
 * navigation also switches docs), so the element is polled for a short while.
 * Returns a function that cancels the wait.
 */
function whenDeeplinkElementReady(
  deepKey: string,
  callback: (element: HTMLElement) => void
): () => void {
  const deadline = Date.now() + DEEPLINK_ELEMENT_TIMEOUT_MS;
  let timer = 0;
  const check = () => {
    const element = document.getElementById(deepKey);
    if (element) {
      callback(element);
      return;
    }
    if (Date.now() < deadline) {
      timer = window.setTimeout(check, DEEPLINK_ELEMENT_POLL_MS);
    }
  };
  // Defer the first check so any re-render triggered by the deeplink change
  // (e.g. collapsed drawers re-opening) has been flushed to the DOM.
  timer = window.setTimeout(check, 0);
  return () => window.clearTimeout(timer);
}

const DEEPLINK_CONTEXT = createContext<DeeplinkContext | null>(null);

export function DeeplinkProvider(props: {children: ComponentChildren}) {
  // NOTE: `useLocation()` is what makes the URL check below reactive. Reading
  // `window.location` alone would only pick up the deeplink on a full page
  // load, since client-side navigations within the CMS never re-mount the doc
  // editor.
  const {url} = useLocation();
  const [value, setValue] = useState(getDeeplinkFromUrl);

  // The deeplink last seen in (or written to) the URL. In-app updates rewrite
  // the URL themselves and do their own scrolling, so tracking it here keeps
  // the URL watcher below from re-applying a deeplink already handled.
  const urlDeeplinkRef = useRef(value);

  const setUrlValue = useCallback((newValue: string) => {
    urlDeeplinkRef.current = newValue;
    replaceDeeplinkInUrl(newValue);
    setValue(newValue);
  }, []);

  const deeplinkCtx = {value, setValue, setUrlValue};

  // Apply deeplinks that arrive via a client-side URL change, e.g. a sidebar
  // tool or global search linking to a field on a doc.
  useEffect(() => {
    const urlDeeplink = getDeeplinkFromUrl();
    if (urlDeeplink === urlDeeplinkRef.current) {
      return;
    }
    urlDeeplinkRef.current = urlDeeplink;
    setValue(urlDeeplink);
    if (!urlDeeplink) {
      return;
    }
    // The scroll is forced because the editor is likely already scrolled from
    // wherever the user navigated from, which would otherwise suppress it.
    return whenDeeplinkElementReady(urlDeeplink, (element) => {
      scrollToDeeplink(element, {behavior: 'smooth', force: true});
    });
  }, [url]);

  //  Enable posting messages from the preview frame to the DocEditor so that
  // fields can be focused.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from same-origin (the in-CMS preview iframe) or
      // from an explicitly allowed embed origin.
      if (!isAllowedOrigin(event.origin)) {
        return;
      }
      if (isScrollToDeeplinkMessage(event.data)) {
        const deepKey = event.data.scrollToDeeplink.deepKey;
        const element = document.getElementById(deepKey);
        if (element) {
          setUrlValue(deepKey);
          scrollToDeeplink(element, {behavior: 'smooth', force: true});
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setUrlValue]);

  return (
    <DEEPLINK_CONTEXT.Provider value={deeplinkCtx}>
      {props.children}
    </DEEPLINK_CONTEXT.Provider>
  );
}

export function useDeeplink(): DeeplinkContext {
  const ctxValue = useContext(DEEPLINK_CONTEXT);
  if (!ctxValue) {
    throw new Error(
      '[useDeeplink()] DeeplinkContext not found, be sure to add <DeeplinkProvider>'
    );
  }
  return ctxValue;
}

/** Opens all the ancestor detail elements. */
function setAncestorsOpen(deeplinkEl: HTMLElement) {
  let current = deeplinkEl;
  while (current && current !== document.body) {
    const detailsParent = current.closest<HTMLDetailsElement>('details');
    if (detailsParent && detailsParent.parentElement) {
      detailsParent.open = true;
      current = detailsParent.parentElement;
    } else {
      break;
    }
  }
}

/** Finds all the ancestor array item headers for a given deeplink element. */
function getArrayItemHeaderAncestors(deeplinkEl: HTMLElement): HTMLElement[] {
  const detailsAncestors: HTMLElement[] = [];
  let current: HTMLElement | null = deeplinkEl;
  while (current && current !== document.body) {
    const parent = current.closest<HTMLElement>(
      '.DocEditor__ArrayField__item'
    ) as HTMLElement | null;
    if (!parent) {
      break;
    }
    const summary = parent.querySelector<HTMLElement>(
      '.DocEditor__ArrayField__item__header'
    );
    if (summary && !detailsAncestors.includes(summary)) {
      detailsAncestors.push(summary);
      current = parent.parentElement;
    } else {
      break;
    }
  }
  return detailsAncestors;
}

/** Scrolls to a deep link field after opening all ancestor details. */
export function scrollToDeeplink(
  deeplinkEl: HTMLElement,
  options: ScrollToDeeplinkOptions = {
    behavior: 'auto',
  }
) {
  setTimeout(
    () => {
      const parent = document.querySelector('.DocumentPage__side');
      if (!parent) {
        return;
      }
      // If the user has already scrolled anywhere, don't scroll to the deeplink.
      if (parent.scrollTop > 0 && !options.force) {
        return;
      }
      // First, ensure all ancestor details elements are open so the element can be scrolled to.
      setAncestorsOpen(deeplinkEl);
      // Build an offset (the array item headers) so the deeplink is not obscured by the header.
      const ancestors = getArrayItemHeaderAncestors(deeplinkEl);
      const modifier = ancestors.reduce((acc, el) => acc + el.offsetHeight, 0);
      const offsetTop = deeplinkEl.offsetTop - modifier;
      parent.scroll({top: offsetTop, behavior: options.behavior});
    },
    // If the deeplink is being forced, no timeout is needed as the document is already at rest.
    // If the deeplink isn't being forced, wait a bit to ensure the document is at rest before scrolling.
    options.force ? 0 : 300
  );
}

export function buildDeeplinkUrl(deepKey: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('deeplink', deepKey!);
  return url.toString();
}
