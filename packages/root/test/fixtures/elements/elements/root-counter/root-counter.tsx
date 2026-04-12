class RootCounter extends HTMLElement {
  connectedCallback() {
    const start = Number(this.getAttribute('start') || 0);
    this.innerHTML = `<root-label>Count: ${start}</root-label>`;
  }
}

customElements.define('root-counter', RootCounter);
