import {useEffect, useState} from 'preact/hooks';

/**
 * Open modal `<dialog>` elements, bottom to top. A modal dialog makes the
 * rest of the page inert and sits in the browser's top layer above any
 * z-index, so anything that has to stay visible and clickable above it
 * (toasts, popovers, menus) portals into the topmost one instead of into
 * `document.body`; see `useOverlayRoot()`.
 */
const stack: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();

/** The page's `overflow` before the first dialog locked scrolling. */
let savedOverflow: string | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

/** Registers a dialog that was just opened with `showModal()`. */
export function pushDialog(dialog: HTMLDialogElement) {
  removeFromStack(dialog);
  stack.push(dialog);
  if (stack.length === 1) {
    // Modal dialogs don't stop the page behind them from scrolling.
    const root = document.documentElement;
    savedOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
  }
  notify();
}

/** Unregisters a dialog that was closed or unmounted. */
export function removeDialog(dialog: HTMLDialogElement) {
  if (!removeFromStack(dialog)) {
    return;
  }
  if (stack.length === 0 && savedOverflow !== null) {
    document.documentElement.style.overflow = savedOverflow;
    savedOverflow = null;
  }
  notify();
}

function removeFromStack(dialog: HTMLDialogElement): boolean {
  const index = stack.indexOf(dialog);
  if (index === -1) {
    return false;
  }
  stack.splice(index, 1);
  return true;
}

/** The topmost open modal dialog, if any. */
export function getTopDialog(): HTMLDialogElement | null {
  return stack[stack.length - 1] ?? null;
}

/**
 * Returns the element overlays should portal into: the topmost open modal
 * dialog, or `document.body` when none is open. Re-renders when that
 * changes.
 *
 * ```tsx
 * const root = useOverlayRoot();
 * return createPortal(<div className="fixed ...">...</div>, root);
 * ```
 */
export function useOverlayRoot(): HTMLElement {
  const [root, setRoot] = useState<HTMLElement>(
    () => getTopDialog() ?? document.body
  );
  useEffect(() => {
    const update = () => setRoot(getTopDialog() ?? document.body);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return root;
}
