class RootCounter extends HTMLElement {
  value = 0;

  connectedCallback() {
    const button = this.querySelector('button');
    const valueEl = this.querySelector('.value');
    if (button && valueEl) {
      button.addEventListener('click', () => {
        this.value += 1;
        valueEl.textContent = String(this.value);
      });
    }
  }
}

if (!customElements.get('root-counter')) {
  customElements.define('root-counter', RootCounter);
}
