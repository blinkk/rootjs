class DsFoo extends HTMLElement {
  connectedCallback() {
    const name = this.getAttribute('name') || 'world';
    const h1 = document.createElement('h1');
    h1.textContent = `Hello ${name}!`;
    this.appendChild(h1);
  }
}

customElements.define('ds-foo', DsFoo);
