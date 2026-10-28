import {useLayoutEffect, useRef} from 'preact/hooks';

const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** The elements inside `root` that Tab can reach, in DOM order. */
export function getTabbables(root: Element): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)
  ).filter((el) => !el.closest('[hidden], [inert]') && el.tabIndex >= 0);
}

/**
 * Keeps Tab and Shift+Tab inside `root`, wrapping from the last tabbable
 * element to the first and back. Call it from `root`'s `keydown` handler.
 */
export function trapTabKey(e: KeyboardEvent, root: HTMLElement) {
  if (e.key !== 'Tab') {
    return;
  }
  const tabbables = getTabbables(root);
  if (tabbables.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Whether `el` was focused by keyboard (it matches `:focus-visible`). */
export function isFocusVisible(el: Element) {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

export interface UseOverlayFocusOptions {
  open: boolean;
  /** The overlay's trigger, which gets focus back when the overlay closes. */
  reference: unknown;
  /** The overlay's floating element. */
  floating: HTMLElement | null;
  /**
   * Returns the element to focus once the overlay opens, or `null` to leave
   * focus where it is.
   */
  initialFocus: (floating: HTMLElement) => HTMLElement | null;
}

/**
 * Moves focus into an overlay when it opens, and back to its trigger when it
 * closes, if focus was still inside it (closing by Escape, by choosing an
 * item, or by clicking the trigger). When the user moved focus elsewhere
 * before it closed, focus stays there.
 */
export function useOverlayFocus(options: UseOverlayFocusOptions) {
  const {open, reference, floating} = options;
  const initialFocusRef = useRef(options.initialFocus);
  initialFocusRef.current = options.initialFocus;
  const wasOpenRef = useRef(false);
  const focusWasInsideRef = useRef(false);

  // Checked while rendering the close, before the floating element (and the
  // focus inside it) is removed from the DOM.
  if (!open && wasOpenRef.current) {
    focusWasInsideRef.current =
      !!floating && floating.contains(document.activeElement);
  }

  useLayoutEffect(() => {
    if (!open || !floating) {
      return;
    }
    const target = initialFocusRef.current(floating);
    target?.focus({preventScroll: true});
  }, [open, floating]);

  useLayoutEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = false;
    if (focusWasInsideRef.current && reference instanceof HTMLElement) {
      reference.focus({preventScroll: true});
    }
  }, [open]);
}
