declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-drawer': preact.JSX.HTMLAttributes;
    }
  }
}

class RootDrawer extends HTMLElement {
  triggerEl: HTMLElement;
  contentEl: HTMLElement;
  expanded = false;

  connectedCallback() {
    this.triggerEl = this.getSlotElement('drawer-trigger');
    if (this.triggerEl) {
      const contentId = this.triggerEl.getAttribute('aria-controls');
      this.contentEl = document.getElementById(contentId);
      this.triggerEl.addEventListener('click', () => this.onTriggerClicked());
    }

    document.addEventListener('click', (e) => this.onClick(e));
  }

  onClick(e: Event) {
    const clickTarget = e.target as HTMLElement;
    if (this.triggerEl.contains(clickTarget)) {
      return;
    }
    if (this.contentEl && !this.contentEl.contains(clickTarget)) {
      this.setExpanded(false);
    }
  }

  onTriggerClicked() {
    this.setExpanded(!this.expanded);
  }

  setExpanded(expanded: boolean) {
    if (!this.contentEl) {
      return;
    }
    this.contentEl.classList.toggle('expanded', expanded);
    this.triggerEl.setAttribute('aria-expanded', String(expanded));
    this.expanded = expanded;
  }

  getSlotElement<T = HTMLElement>(name: string): T {
    return this.querySelector(`[data-slot="${name}"]`) as T;
  }
}

if (!customElements.get('root-drawer')) {
  customElements.define('root-drawer', RootDrawer);
}
