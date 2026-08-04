import {errorMessage, showErrorNotification} from './notifications.js';

/**
 * Errors that are noisy, unactionable, or not ours. `ResizeObserver loop`
 * warnings are fired by browsers during normal layout thrash and are harmless;
 * a bare "Script error." is what cross-origin scripts report and carries no
 * detail worth surfacing.
 */
const IGNORED_PATTERNS = [/^ResizeObserver loop/i, /^Script error\.?$/i];

function testIsIgnored(message: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

let installed = false;

/**
 * Surfaces uncaught errors and unhandled promise rejections as notifications.
 *
 * Without this, anything thrown outside of a render pass — an editor plugin's
 * update listener, a DOM event handler, a floating promise — is swallowed by
 * the browser and only visible in the devtools console, so users see a UI that
 * silently stops updating with no indication that anything went wrong. Error
 * boundaries don't help here: they only catch errors thrown while rendering.
 *
 * Safe to call more than once; handlers are only installed on the first call.
 */
export function installGlobalErrorHandlers() {
  if (installed) {
    return;
  }
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    // Resource load failures (e.g. a broken <img>) also fire an `error` event
    // on the window, but they aren't script errors and have no useful message.
    // Identified by their target being an element; script errors target the
    // window itself.
    const target = event.target as {tagName?: string} | null;
    if (target?.tagName) {
      return;
    }
    const err = event.error ?? event.message;
    if (testIsIgnored(errorMessage(err))) {
      return;
    }
    showErrorNotification(err, {title: 'Something went wrong'});
  });

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      const err = event.reason;
      if (testIsIgnored(errorMessage(err))) {
        return;
      }
      showErrorNotification(err, {title: 'Something went wrong'});
    }
  );
}
