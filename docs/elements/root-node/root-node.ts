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

  static clearTargeted() {
    document
      .querySelectorAll<RootNodeElement>('root-node.--targeted')
      .forEach((el) => el.classList.remove('--targeted'));
  }

  setFlashed() {
    this.classList.remove('--flash');
    this.classList.add('--flash');
    this.scrollIntoView({
      behavior: 'smooth',
    });
  }

  setTargeted() {
    console.log('targeting', this.deepKey);
    this.classList.remove('--flash');
    this.classList.add('--targeted');
    this.scrollIntoViewIfNeeded({
      behavior: 'smooth',
    });
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

  /** Sends a message to the CMS signaling whether the connection should be "enabled" or "disabled". When enabled, the CMS will allow the user to focus a node. */
  static setConnectionStatus(status: 'connected' | 'disconnected') {
    window.parent.postMessage(
      {
        setConnectionStatus: {
          status,
        },
      },
      '*'
    );
  }
}

if (!customElements.get('root-node')) {
  customElements.define('root-node', RootNodeElement);
}

window.addEventListener('message', (event) => {
  const {targetNode} = event.data;
  console.log(event.data);
  if (targetNode) {
    const {deepKey} = targetNode;
    RootNodeElement.clearTargeted();
    if (deepKey) {
      const rootNode = RootNodeElement.getByDeepKey(deepKey);
      if (rootNode) {
        rootNode.setTargeted();
      }
    }
  }
});
