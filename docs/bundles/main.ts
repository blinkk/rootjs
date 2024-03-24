function main() {
  const urlParams = new URLSearchParams(window.location.search);
  const isPreview = urlParams.get('preview') === 'true';
  if (isPreview) {
    updatePreview();
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

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
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
