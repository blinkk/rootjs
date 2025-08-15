import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useState} from 'preact/hooks';

export interface DeeplinkContext {
  value: string;
  setValue: (value: string) => void;
}

/** Messages that can be sent to the DocEditor window. */
interface DocEditorMessage {
  /** Scrolls to a specific deeplink within the field editor. */
  scrollToDeeplink?: {
    /** The key of the field to scroll to. */
    deepKey: string;
  };
}

interface ScrollToDeeplinkOptions {
  /** If true, will scroll to the deeplink even if the user has scrolled. */
  force?: boolean;
  /** Options for the scroll behavior. */
  behavior: 'auto' | 'smooth';
}

function getDeeplink(): string {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('deeplink') || '';
}

const DEEPLINK_CONTEXT = createContext<DeeplinkContext | null>(null);

export function DeeplinkProvider(props: {children: ComponentChildren}) {
  const [value, setValue] = useState(getDeeplink());
  const deeplinkCtx = {value, setValue};

  /** Enable posting messages from the preview frame to the DocEditor so that fields can be focused. */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const req = event.data as DocEditorMessage;
      if (req.scrollToDeeplink) {
        const deepKey = req.scrollToDeeplink.deepKey;
        const element = document.getElementById(deepKey);
        if (element) {
          setValue(deepKey);
          scrollToDeeplink(element, {behavior: 'smooth', force: true});
          // Update the URL without modifying the history.
          const url = new URL(window.location.href);
          url.searchParams.set('deeplink', deepKey);
          window.history.replaceState({}, '', url.toString());
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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
    options.force ? 0 : 100
  );
}
