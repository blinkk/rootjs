import {renderLabel} from '../../lib/shared.js';

class RootB extends HTMLElement {
  connectedCallback() {
    renderLabel(this, 'b');
  }
}

customElements.define('root-b', RootB);
