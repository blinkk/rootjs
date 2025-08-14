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
    // Send a message to the CMS DocPage requesting the field be focused.
    // TODO: This should be bundled into the CMS package so that sites can consume it.
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
