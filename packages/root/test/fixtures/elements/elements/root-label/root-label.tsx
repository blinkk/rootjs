class RootLabel extends HTMLElement {
  connectedCallback() {
    const label = document.createElement('label');
    label.textContent = this.getAttribute('label') || this.textContent || '';
    this.appendChild(label);
  }
}

customElements.define('root-label', RootLabel);
