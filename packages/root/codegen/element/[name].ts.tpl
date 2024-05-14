declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      '[[name]]': preact.JSX.HTMLAttributes;
    }
  }
}

class [[name:camel_upper]]Element extends HTMLElement {
  connectedCallback() {
    console.log('[[name]] loaded');
  }
}

if (!customElements.get('[[name]]')) {
  customElements.define('[[name]]', [[name:camel_upper]]Element);
}
