import {renderLabel} from '../../lib/shared.js';

class RootA extends HTMLElement {
  connectedCallback() {
    renderLabel(this, 'a');
  }
}

customElements.define('root-a', RootA);
