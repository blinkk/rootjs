declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-node': preact.JSX.HTMLAttributes;
    }
  }
}

/** An element that represents actions associated with a CMS field. */
class RootNode extends HTMLElement {
  private deepKey: string;
  buttonElement: HTMLButtonElement;

  connectedCallback() {
    this.deepKey = this.getAttribute('data-deep-key');
    this.buttonElement = this.getSlotElement('button');
    this.buttonElement.addEventListener('click', () =>
      this.requestDeepLinkScroll()
    );
  }

  private getSlotElement<T = HTMLElement>(name: string): T {
    return this.querySelector(`[data-slot="${name}"]`) as T;
  }

  /** Sends a message to the CMS requesting that the field associated with this node be focused. */
  requestDeepLinkScroll() {
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

if (!customElements.get('root-node')) {
  customElements.define('root-node', RootNode);
}
