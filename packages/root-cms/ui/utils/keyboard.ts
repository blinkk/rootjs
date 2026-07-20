/**
 * Shared keyboard helpers for document-level shortcut handlers that must not
 * interfere with text editing (native input undo, Lexical shortcuts, etc.).
 */

const IS_APPLE =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * Returns true when the event originates from a field where the user is
 * actively typing, e.g. a text input or a `contenteditable` rich text editor
 * (Lexical). Document-level shortcuts should not fire in those contexts —
 * Lexical, for instance, binds its own Cmd+K ("insert link") and Cmd+Z
 * (undo), and native inputs have built-in text undo.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  // True for the contenteditable host and any element nested inside one
  // (e.g. Lexical rich text fields).
  return target.isContentEditable;
}

/** Returns true for the platform "undo" shortcut (⌘Z / Ctrl+Z). */
export function isUndoKeyEvent(event: KeyboardEvent): boolean {
  return (
    isKey(event, 'z', 'KeyZ') &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Returns true for the platform "redo" shortcut (⌘⇧Z / Ctrl+Shift+Z, plus
 * Ctrl+Y on non-Apple platforms, mirroring Lexical's shortcut map).
 */
export function isRedoKeyEvent(event: KeyboardEvent): boolean {
  if (
    isKey(event, 'z', 'KeyZ') &&
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey
  ) {
    return true;
  }
  return (
    !IS_APPLE &&
    isKey(event, 'y', 'KeyY') &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function isKey(event: KeyboardEvent, key: string, code: string): boolean {
  return event.key.toLowerCase() === key || event.code === code;
}
