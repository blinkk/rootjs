/**
 * Global navigation guards used to warn users before leaving a page with
 * unsaved changes.
 *
 * preact-iso's `<LocationProvider>` performs SPA navigations by listening to
 * `click` and `popstate` events on `window`. For `popstate` (back/forward
 * button) the event target is `window` itself, so capture/bubble phases don't
 * apply and listeners run in registration order. To run *before* the router,
 * `installNavigationGuards()` must be called at app bootstrap, before the
 * `<LocationProvider>` mounts (see ui.tsx).
 */

export interface NavigationGuard {
  /** Confirmation message shown to the user. */
  message: string;
  /** URL to restore when the user cancels a back/forward navigation. */
  url: string;
}

const guards = new Set<NavigationGuard>();
let installed = false;

function activeGuard(): NavigationGuard | undefined {
  return guards.values().next().value;
}

/** Warns on full page unloads (refresh, tab close, external links). */
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!activeGuard()) {
    return;
  }
  e.preventDefault();
  // Required by some browsers to show the confirmation dialog.
  e.returnValue = '';
}

/**
 * Warns on SPA navigations triggered by internal link clicks. Registered in
 * the capture phase so it runs before preact-iso's bubble-phase listener.
 * Mirrors the router's own link detection so only clicks that would actually
 * navigate trigger the warning.
 */
function onClickCapture(e: MouseEvent) {
  const guard = activeGuard();
  if (!guard) {
    return;
  }
  if (
    e.defaultPrevented ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.shiftKey ||
    e.button !== 0
  ) {
    return;
  }
  const link = e
    .composedPath()
    .find(
      (el): el is HTMLAnchorElement =>
        el instanceof HTMLAnchorElement && !!el.href
    );
  if (
    !link ||
    (link.getAttribute('href') || '').startsWith('#') ||
    link.download
  ) {
    return;
  }
  // Links that open in a new tab or go to an external origin trigger a full
  // page unload (or no unload at all), which is handled by `beforeunload`.
  if (
    link.origin !== window.location.origin ||
    !/^(_?self)?$/i.test(link.target)
  ) {
    return;
  }
  if (!window.confirm(guard.message)) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

/**
 * Warns on back/forward navigations. `popstate` fires *after* the history
 * entry has already changed, so the navigation can't be prevented outright.
 * Instead, when the user cancels, the guarded URL is pushed back onto the
 * history stack and the event is stopped before preact-iso's listener
 * re-renders the route.
 */
function onPopState(e: PopStateEvent) {
  const guard = activeGuard();
  if (!guard) {
    return;
  }
  if (window.confirm(guard.message)) {
    return;
  }
  e.stopImmediatePropagation();
  window.history.pushState(null, '', guard.url);
}

/**
 * Installs the global guard listeners. Must be called before the preact-iso
 * `<LocationProvider>` mounts so the `popstate` listener runs first.
 */
export function installNavigationGuards() {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('click', onClickCapture, {capture: true});
  window.addEventListener('popstate', onPopState);
}

/**
 * Registers a navigation guard. Returns a function that removes the guard.
 */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}
