import hljs from 'highlight.js/lib/common';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-code': preact.JSX.HTMLAttributes;
    }
  }
}

class RootCode extends HTMLElement {
  connectedCallback() {
    const pre = this.querySelector('pre');
    if (!pre) {
      return;
    }
    const language = this.getAttribute('data-language');
    if (language) {
      pre.classList.add(`language-${language}`);
    }
    hljs.configure({ignoreUnescapedHTML: true});
    hljs.highlightElement(pre);
  }
}

if (!customElements.get('root-code')) {
  customElements.define('root-code', RootCode);
}
