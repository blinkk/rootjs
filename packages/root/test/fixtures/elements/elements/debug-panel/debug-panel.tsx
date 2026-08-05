// This file is meant to represent a preview-only element, which should be
// excluded from the SSG build through a root.config.ts `build.excludeElements`
// pattern.

class DebugPanel extends HTMLElement {
  connectedCallback() {
    const label = document.createElement('label');
    label.textContent = this.getAttribute('label') || this.textContent || '';
    this.appendChild(label);
  }
}

customElements.define('debug-panel', DebugPanel);
