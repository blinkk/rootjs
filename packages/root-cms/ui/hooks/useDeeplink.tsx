import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';
import {isScrollToDeeplinkMessage} from '../../shared/embed-protocol.js';
import {isAllowedOrigin} from '../utils/embed-bridge.js';

export interface DeeplinkContext {
  value: string;
  setValue: (value: string) => void;
}

interface ScrollToDeeplinkOptions {
  /** If true, will scroll to the deeplink even if the user has scrolled. */
  force?: boolean;
  /** Options for the scroll behavior. */
  behavior: 'auto' | 'smooth';
}

function getDeeplinkFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('deeplink') || '';
}

/** Writes (or clears) the `deeplink` query param without touching history. */
function syncDeeplinkUrl(deepKey: string) {
  const url = new URL(window.location.href);
  if (deepKey) {
    url.searchParams.set('deeplink', deepKey);
  } else {
    url.searchParams.delete('deeplink');
  }
  window.history.replaceState({}, '', url.toString());
}

const DEEPLINK_CONTEXT = createContext<DeeplinkContext | null>(null);

export function DeeplinkProvider(props: {children: ComponentChildren}) {
  const [value, setValueState] = useState(getDeeplinkFromUrl);

  // Live mirror of `value` so `setValue` can read the current value
  // synchronously (without depending on a possibly-stale render closure).
  const valueRef = useRef(value);
  valueRef.current = value;

  // Tracks a field that was *just* cleared so we can ignore the preview
  // iframe's `scrollToDeeplink` echo (clicking/focusing in the preview posts a
  // message back, which would otherwise immediately re-add the deeplink and
  // cause a visible "flash off then back on" in the URL).
  const recentlyCleared = useRef<{deepKey: string; at: number} | null>(null);

  // Single source of truth: update React state AND keep the URL in sync. This
  // avoids fragile "read the URL on every render" coupling that made the
  // deeplink toggle unreliable.
  const setValue = useCallback((next: string) => {
    const prev = valueRef.current;
    if (!next && prev) {
      // Mark the cleared key synchronously so an echo arriving before React
      // commits the new state is still suppressed.
      recentlyCleared.current = {deepKey: prev, at: Date.now()};
    } else if (next) {
      recentlyCleared.current = null;
    }
    valueRef.current = next;
    setValueState(next);
    syncDeeplinkUrl(next);
  }, []);

  const deeplinkCtx = {value, setValue};

  // Allow pressing "Esc" to unselect the currently highlighted field.
  useEffect(() => {
    if (!value) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      setValue('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [value, setValue]);

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
        // Ignore the preview's echo of a deeplink the user just toggled off.
        // Match the exact key as well as parent/child keys, since the echo can
        // reference a nested field of the one that was cleared.
        const cleared = recentlyCleared.current;
        if (cleared && Date.now() - cleared.at < 1000) {
          const a = cleared.deepKey;
          const b = deepKey;
          if (a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`)) {
            return;
          }
        }
        const element = document.getElementById(deepKey);
        if (element) {
          setValue(deepKey);
          scrollToDeeplink(element, {behavior: 'smooth', force: true});
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setValue]);

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

/**
 * Like {@link useDeeplink} but returns `null` instead of throwing when there is
 * no surrounding `<DeeplinkProvider>`. Useful for components that can be used
 * both inside and outside the doc editor (e.g. {@link Viewers}).
 */
export function useOptionalDeeplink(): DeeplinkContext | null {
  return useContext(DEEPLINK_CONTEXT);
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
