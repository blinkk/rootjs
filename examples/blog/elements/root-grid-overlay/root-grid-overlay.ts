declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * Grid overlay, toggle via ctrl+g.
       */
      'root-grid-overlay': preact.JSX.HTMLAttributes;
    }
  }
}

/**
 * The <root-grid-overlay> element listens for the ctrl+g keyboard shortcut and
 * toggles the grid overlay.
 */
class Element extends HTMLElement {
  visible = false;

  /**
   * Callback for when the element enters the DOM.
   */
  connectedCallback() {
    window.addEventListener('keydown', this.onKey, {passive: true});
  }

  /**
   * Callback for when the element exits the DOM.
   */
  disconnectedCallback() {
    window.removeEventListener('keydown', this.onKey);
  }

  toggle(enabled?: boolean) {
    const visible = enabled ?? !this.visible;
    this.visible = visible;
    this.classList.toggle('visible', this.visible);
  }

  /**
   * Handler for key presses.
   */
  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'g') {
      e.preventDefault();
      this.toggle();
    }
  };
}

if (!customElements.get('root-grid-overlay')) {
  customElements.define('root-grid-overlay', Element);
}
