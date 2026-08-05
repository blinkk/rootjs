// This file is meant to represent an element that only makes sense when a page
// is rendered on demand, which should be excluded from the SSG output through a
// root.config.ts `elements.excludeFromSsg` pattern.

class DebugPanel extends HTMLElement {
  connectedCallback() {
    const label = document.createElement('label');
    label.textContent = this.getAttribute('label') || this.textContent || '';
    this.appendChild(label);
  }
}

customElements.define('debug-panel', DebugPanel);
