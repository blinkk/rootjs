import hljs from 'highlight.js/lib/common';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-code': preact.JSX.HTMLAttributes;
    }
  }
}

/** How long the "copied" state shows after a click, in milliseconds. */
const COPIED_DURATION = 2000;

/**
 * Highlights the `<pre>` inside it for the `data-language` attribute. Without
 * a language, the code is left as plain text. A child `[data-copy]` button
 * copies the code to the clipboard.
 */
class RootCode extends HTMLElement {
  private copiedTimeout?: number;

  connectedCallback() {
    const pre = this.querySelector('pre');
    if (!pre) {
      return;
    }
    const language = this.getAttribute('data-language');
    if (language) {
      pre.classList.add(`language-${language}`);
      hljs.configure({ignoreUnescapedHTML: true});
      hljs.highlightElement(pre);
    }

    const copyButton = this.querySelector<HTMLButtonElement>('[data-copy]');
    copyButton?.addEventListener('click', () => this.copy(pre, copyButton));
  }

  private async copy(pre: HTMLElement, button: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(pre.textContent || '');
    } catch (err) {
      console.error('failed to copy code:', err);
      return;
    }
    button.toggleAttribute('data-copied', true);
    button.setAttribute('aria-label', 'Copied');
    window.clearTimeout(this.copiedTimeout);
    this.copiedTimeout = window.setTimeout(() => {
      button.toggleAttribute('data-copied', false);
      button.setAttribute('aria-label', 'Copy code');
    }, COPIED_DURATION);
  }
}

if (!customElements.get('root-code')) {
  customElements.define('root-code', RootCode);
}
