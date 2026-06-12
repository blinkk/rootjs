import {useEffect} from 'preact/hooks';
import {registerNavigationGuard} from '../utils/navigation-guard.js';

const CONFIRMATION_MESSAGE =
  'You have unsaved changes. Are you sure you want to leave this page?';

/**
 * Warns the user before navigating away from the page when there are unsaved
 * changes. Handles full page unloads (refresh, tab close, external links) as
 * well as SPA navigations (internal link clicks and the browser back/forward
 * buttons) via the global navigation guards installed in ui.tsx.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) {
      return;
    }
    return registerNavigationGuard({
      message: CONFIRMATION_MESSAGE,
      url: window.location.href,
    });
  }, [dirty]);
}
