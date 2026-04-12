// This file is meant to represent a storybook story, which should be excluded
// from the automatic element injection through a root.config.ts exclude
// pattern.

class RootExclude extends HTMLElement {
  connectedCallback() {
    const label = document.createElement('label');
    label.textContent = this.getAttribute('label') || this.textContent || '';
    this.appendChild(label);
  }
}

customElements.define('root-exclude', RootExclude);
