/** Messages that can be sent from the CMS to the preview. */
interface RootNodeEventData {
  highlightNode?: {
    deepKey: string | null;
    options?: {
      scroll: boolean;
    };
  };
}

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-node': preact.JSX.HTMLAttributes;
    }
  }
}

/** An element that represents actions associated with a CMS field. */
class RootNodeElement extends HTMLElement {
  private deepKey: string;
  buttonElement: HTMLButtonElement;

  connectedCallback() {
    this.deepKey = this.getAttribute('data-deep-key');
    this.buttonElement = this.getSlotElement('button');
    this.buttonElement.addEventListener('click', () =>
      RootNodeElement.requestDeepLinkScroll(this.deepKey)
    );
  }

  private getSlotElement<T = HTMLElement>(name: string): T {
    return this.querySelector(`[data-slot="${name}"]`) as T;
  }

  static getByDeepKey(deepKey: string): RootNodeElement | null {
    return document.querySelector<RootNodeElement>(
      `root-node[data-deep-key="${deepKey}"]`
    );
  }

  /** Clears all the highlighted nodes. */
  static clearAllHighlighted() {
    document
      .querySelectorAll<RootNodeElement>('root-node.--highlighted')
      .forEach((el) => el.classList.remove('--highlighted'));
  }

  /** Sets an individual node as highlighted. */
  setHighlighted(scroll: boolean = false) {
    this.classList.add('--highlighted');
    if (scroll) {
      this.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }

  /** Sends a message to the CMS requesting that the field associated with this node be focused. */
  static requestDeepLinkScroll(deepKey: string) {
    // TODO: This should be bundled into the CMS package so that sites can consume it.
    window.parent.postMessage(
      {
        scrollToDeeplink: {
          deepKey: deepKey,
        },
      },
      '*'
    );
  }
}

/** Creates a listener to handle messages sent from the CMS. */
function createMessageListener() {
  const listener = (event: MessageEvent<RootNodeEventData>) => {
    const {highlightNode} = event.data;
    if (highlightNode) {
      const {deepKey, options} = highlightNode;
      RootNodeElement.clearAllHighlighted();
      if (deepKey) {
        const rootNode = RootNodeElement.getByDeepKey(deepKey);
        if (rootNode) {
          rootNode.setHighlighted(options?.scroll);
        }
      }
    }
  };
  window.addEventListener('message', listener);
  return listener;
}

if (!customElements.get('root-node')) {
  customElements.define('root-node', RootNodeElement);
  createMessageListener();
}
