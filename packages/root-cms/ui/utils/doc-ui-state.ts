const SCROLL_KEY = 'root::cms::scroll';
const OPEN_KEY = 'root::cms::open';

/*
 * Save the scroll position and open field editors prior to reloading the page.
 */
function saveUiState() {
  const side = document.querySelector(
    '.DocumentPage__side'
  ) as HTMLElement | null;
  if (side) {
    sessionStorage.setItem(SCROLL_KEY, String(side.scrollTop));
  }
  const openSummaries = Array.from(
    document.querySelectorAll(
      '.DocEditor__ObjectFieldDrawer__drawer[open], .DocEditor__ArrayField__item[open] summary'
    )
  )
    .map((el) => el.id)
    .filter(Boolean);
  if (openSummaries.length > 0) {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(openSummaries));
  }
}

/*
 * Restore the scroll position and open field editors when page is loaded.
 */
function restoreUiState() {
  // Restore open editors.
  const open = sessionStorage.getItem(OPEN_KEY);
  if (open) {
    try {
      const ids = JSON.parse(open) as string[];
      ids.forEach((id) => {
        const summary = document.getElementById(id);
        if (summary) {
          const details = summary.closest('details');
          if (details) {
            details.open = true;
          }
        }
      });
    } catch {
      /* ignore */
    }
  }
  // Restore scroll position.
  const side = document.querySelector(
    '.DocumentPage__side'
  ) as HTMLElement | null;
  const scroll = sessionStorage.getItem(SCROLL_KEY);
  if (side && scroll) {
    side.scrollTop = parseInt(scroll, 10);
  }
}

/** Returns whether the UI state should be saved and restored. */
function testPreserveUiState() {
  // Currently, this is mainly used for development. Specifically, when the page is HMR'ed, we
  // want to preserve the scroll position and open editors.
  return window.location.hostname === 'localhost';
}

/** Preserves the UI state across page reloads. */
export function preserveUiState(): () => void {
  // Do nothing if the UI state should not be preserved.
  if (!testPreserveUiState()) {
    return () => {};
  }
  // Restore the UI state once the data is loaded.
  restoreUiState();
  const beforeUnloadHandler = () => {
    // Save the scroll position and open field editors prior to reloading the page.
    saveUiState();
  };
  // Before the page is unloaded, save the ui state.
  window.addEventListener('beforeunload', beforeUnloadHandler);
  // Return a callback that removes the event listener.
  return () => {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  };
}
