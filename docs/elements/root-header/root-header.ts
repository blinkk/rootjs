declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-header': preact.JSX.HTMLAttributes;
    }
  }
}

class RootHeader extends HTMLElement {
  private nav: HTMLElement;
  private navLinks: HTMLElement[];
  private menu: HTMLElement;
  private menuLinks: HTMLElement[];
  private burger: HTMLElement;
  private close: HTMLElement;
  private lastScrollY: number;
  private menuOpen = false;

  connectedCallback() {
    this.burger = this.getSlotElement('burger');
    this.burger?.addEventListener('click', () => this.toggleMenu());

    this.close = this.getSlotElement('close');
    this.close?.addEventListener('click', () => this.closeMenu());

    this.nav = this.getSlotElement('nav');
    this.menu = this.getSlotElement('menu');

    if (this.nav && this.menu) {
      this.navLinks = Array.from(this.nav?.querySelectorAll('a,  button'));
      this.menuLinks = Array.from(this.menu?.querySelectorAll('a, button'));
      this.disableMenuFocusTrap();
    }

    this.lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => this.onScroll(), {passive: true});
    this.onScroll();

    this.addEventListener('click', (e) => this.onClick(e));

    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeMenu();
      }
    });
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', () => this.onScroll());
  }

  getSlotElement<T = HTMLElement>(name: string): T {
    return this.querySelector(`[data-slot="${name}"]`) as T;
  }

  onClick(e: MouseEvent) {
    if (!e.target) {
      return;
    }
    // Close the menu when user clicks on a deeplink.
    const closestAnchor = (e.target as HTMLElement).closest('a[href]');
    if (closestAnchor && closestAnchor.getAttribute('href').startsWith('#')) {
      this.closeMenu();
    }
  }

  onScroll() {
    const currentScrollY = window.scrollY;

    // Add `y:top` when at the top of the page.
    const isTop = currentScrollY <= 40;
    this.classList.toggle('y:top', isTop);

    // Add `dir:up` or `dir:down` when scrolling up or down.
    if (currentScrollY > this.lastScrollY) {
      // Scrolling down.
      this.classList.add('dir:down');
      this.classList.remove('dir:up');
    } else if (currentScrollY < this.lastScrollY) {
      // Scrolling up.
      this.classList.add('dir:up');
      this.classList.remove('dir:down');
    }

    this.lastScrollY = currentScrollY;
  }

  closeMenu() {
    this.menuOpen = false;
    document.body.classList.remove('menu:open');

    if (this.burger) {
      this.burger.setAttribute('aria-expanded', 'false');
    }

    if (this.menu) {
      this.menu.inert = true;
    }
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    document.body.classList.toggle('menu:open', this.menuOpen);

    if (this.burger) {
      this.burger.setAttribute(
        'aria-expanded',
        this.menuOpen ? 'true' : 'false'
      );
    }

    if (this.menu) {
      this.menu.inert = !this.menuOpen;
    }

    if (this.nav && this.menu) {
      if (this.menuOpen) {
        this.enableMenuFocusTrap();
      } else {
        this.disableMenuFocusTrap();
      }
    }
  }

  trapMenuFocus(e: KeyboardEvent) {
    const firstFocusableEl = this.navLinks[0];
    const lastFocusableEl = this.menuLinks[this.menuLinks.length - 1];
    const isTabPressed = e.key === 'Tab';

    if (isTabPressed) {
      if (e.shiftKey) {
        /* shift + tab */ if (document.activeElement === firstFocusableEl) {
          lastFocusableEl.focus();
          e.preventDefault();
        }
      } /* tab */ else {
        if (document.activeElement === lastFocusableEl) {
          firstFocusableEl.focus();
          e.preventDefault();
        }
      }
    }
  }

  enableMenuFocusTrap() {
    this.addEventListener('keydown', (e) => {
      this.trapMenuFocus(e);
    });

    // Disable nav links except the burger
    this.navLinks?.forEach((el: HTMLElement) => {
      if (el.id !== 'burger') {
        el.tabIndex = -1;
      }
    });

    // Enable focus on menu links
    this.menuLinks?.forEach((el: HTMLElement) => {
      el.tabIndex = 0;
    });
  }

  disableMenuFocusTrap() {
    this.removeEventListener('keydown', (e) => {
      this.trapMenuFocus(e);
    });

    // Enable nav links
    this.navLinks?.forEach((el: HTMLElement) => {
      if (el.id !== 'burger') {
        el.tabIndex = 0;
      }
    });

    // Disable focus on menu links
    this.menuLinks?.forEach((el: HTMLElement) => {
      el.tabIndex = -1;
    });
  }
}

if (!customElements.get('root-header')) {
  customElements.define('root-header', RootHeader);
}
