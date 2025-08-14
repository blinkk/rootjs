declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-node-editor': preact.JSX.HTMLAttributes;
    }
  }
}

class RootNodeEditor extends HTMLElement {
  private deepKey: string;
  buttonElement: HTMLButtonElement;

  connectedCallback() {
    // Do nothing if the page isn't in an iframe.
    if (window.self === window.top) {
      return;
    }
    this.deepKey = this.getAttribute('data-deep-key');
    this.buttonElement = this.getSlotElement('button');
    this.buttonElement.addEventListener('click', () =>
      this.requestDeepLinkScroll()
    );
  }

  getSlotElement<T = HTMLElement>(name: string): T {
    return this.querySelector(`[data-slot="${name}"]`) as T;
  }

  requestDeepLinkScroll() {
    // Send a message to the
    window.parent.postMessage(
      {
        scrollToDeeplink: {
          deepKey: this.deepKey,
        },
      },
      '*'
    );
  }
}

if (!customElements.get('root-node-editor')) {
  customElements.define('root-node-editor', RootNodeEditor);
}
