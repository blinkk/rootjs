function main() {
  const urlParams = new URLSearchParams(window.location.search);
  const isPreview = urlParams.get('preview') === 'true';
  if (isPreview) {
    updatePreview();
  } else {
    trackCtaClicks();
  }
}

function updatePreview() {
  // Re-write all relative URLs to include ?preview=true.
  const links = document.querySelectorAll('a[href]');
  links.forEach((link: HTMLAnchorElement) => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('/')) {
      const url = new URL(href, window.location.href);
      url.searchParams.set('preview', 'true');
      link.href = url.toString();
    }
  });

  // If in iframe, reset scroll position.
  if (isInIframe()) {
    preserveScrollY();
  }
}

/**
 * Reports clicks on elements marked with `data-cta` (see `useCtaAttrs()`) to
 * Google Analytics as `cta_click` events.
 */
function trackCtaClicks() {
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const cta = target?.closest<HTMLElement>('[data-cta]');
    if (!cta) {
      return;
    }
    const gtag = (window as {gtag?: (...args: unknown[]) => void}).gtag;
    if (typeof gtag !== 'function') {
      return;
    }
    const label = cta.dataset.cta || cta.textContent?.trim() || '';
    // GA4 truncates event parameter values longer than 100 characters.
    gtag('event', 'cta_click', {
      cta_label: label.slice(0, 100),
      cta_url: cta instanceof HTMLAnchorElement ? cta.href : undefined,
      cta_module: cta.dataset.ctaModule,
      cta_template: cta.dataset.ctaTemplate,
    });
  });
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function preserveScrollY() {
  // Preserve the scrollY position when in the CMS preview.
  const storageKey = '_scrolly';
  const val = sessionStorage.getItem(storageKey);
  if (val) {
    const html = document.documentElement;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({top: window.parseInt(val)});
    setTimeout(() => {
      html.style.removeProperty('scroll-behavior');
    });
  }
  window.addEventListener('beforeunload', () => {
    sessionStorage.setItem(storageKey, String(window.scrollY));
  });
}

// Wait until the DOM is loaded.
if (document.readyState !== 'loading') {
  main();
} else {
  document.addEventListener('DOMContentLoaded', main);
}
