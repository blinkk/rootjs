import {
  PreviewConnection,
  RootCMSBrowserClient,
} from '@blinkk/root-cms/browser-client';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-node': preact.JSX.HTMLAttributes;
    }
  }
}

let preview: PreviewConnection;

/** An element that represents actions associated with a CMS field. */
class RootNodeElement extends HTMLElement {
  private deepKey: string;
  buttonElement: HTMLButtonElement;

  connectedCallback() {
    this.deepKey = this.getAttribute('data-deep-key');
    this.buttonElement = this.getSlotElement('button');
    // "Click to edit": focus the field in the doc editor.
    this.buttonElement.addEventListener('click', () =>
      preview.focusField(this.deepKey)
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
}

if (!customElements.get('root-node')) {
  customElements.define('root-node', RootNodeElement);
  // Highlight nodes when the doc editor hovers/focuses a field.
  preview = RootCMSBrowserClient.connectPreview();
  preview.on('highlight', ({deepKey, scroll}) => {
    RootNodeElement.clearAllHighlighted();
    if (deepKey) {
      RootNodeElement.getByDeepKey(deepKey)?.setHighlighted(scroll);
    }
  });
}
