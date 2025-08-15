import {ComponentChildren, createContext} from 'preact';
import {useContext, useState} from 'preact/hooks';

export interface DeeplinkContext {
  value: string;
  setValue: (value: string) => void;
}

function getDeeplink(): string {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('deeplink') || '';
}

const DEEPLINK_CONTEXT = createContext<DeeplinkContext | null>(null);

export function DeeplinkProvider(props: {children: ComponentChildren}) {
  const [value, setValue] = useState(getDeeplink());
  const deeplinkCtx = {value, setValue};
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

export function scrollToDeeplink(deeplinkEl: HTMLElement) {
  const parent = document.querySelector('.DocumentPage__side');
  if (parent) {
    // If the user has already scrolled anywhere, don't scroll to the deeplink.
    if (parent.scrollTop > 0) {
      return;
    }
    // Use a brief timeout to ensure the DOM is at rest before scrolling.
    requestAnimationFrame(() => {
      const offsetTop = deeplinkEl.offsetTop;
      parent.scroll({top: offsetTop, behavior: 'auto'});
    });
  }
}
