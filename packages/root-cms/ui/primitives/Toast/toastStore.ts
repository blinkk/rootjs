import type {ComponentChildren} from 'preact';

/**
 * Options for a toast, mirroring the `@mantine/notifications` 4.2.12 options
 * the CMS uses.
 */
export interface ToastOptions {
  /**
   * Id for `updateNotification()` / `hideNotification()`. Generated when
   * omitted. Showing a toast whose id is already shown does nothing.
   */
  id?: string;
  /** Bold first line. */
  title?: ComponentChildren;
  /** Body text, or any content (e.g. an Undo button). */
  message: ComponentChildren;
  /**
   * Mantine color name, mapped onto a status: `red` (danger), `green`
   * (success), `yellow` / `orange` (warning), `blue` (info). Other colors,
   * or none, are neutral. See `toastStatus()`.
   */
  color?: string;
  /** Replaces the status icon. */
  icon?: ComponentChildren;
  /** Shows a spinner in place of the icon. */
  loading?: boolean;
  /**
   * Milliseconds before the toast hides itself, or `false` to keep it until
   * dismissed. `true` or omitted uses the `Toaster`'s default (4000ms).
   * Paused while the pointer or focus is on the toast.
   */
  autoClose?: boolean | number;
  /** Hides the dismiss button. */
  disallowClose?: boolean;
  className?: string;
  /** Called after the toast is hidden, however it was hidden. */
  onClose?: (toast: Toast) => void;
  /** Called when the toast first appears on screen. */
  onOpen?: (toast: Toast) => void;
}

/** A toast in the store. */
export interface Toast extends ToastOptions {
  id: string;
}

/**
 * Holds the toasts a `Toaster` renders. The app uses the shared
 * `toastStore` through `showNotification()` and friends; tests and the
 * gallery create their own.
 */
export interface ToastStore {
  /** Current toasts, oldest first. */
  getToasts(): Toast[];
  /** Calls `listener` after every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Shows a toast and returns its id. */
  show(options: ToastOptions): string;
  /**
   * Replaces the toast with the same id (all of its options, like Mantine's
   * `updateNotification`), restarting its auto-close timer. Does nothing if
   * no such toast is shown.
   */
  update(options: ToastOptions & {id: string}): void;
  /** Hides a toast and calls its `onClose`. */
  hide(id: string): void;
  /** Hides every toast. */
  clean(): void;
}

let nextId = 0;

/** Creates an empty toast store. */
export function createToastStore(): ToastStore {
  let toasts: Toast[] = [];
  const listeners = new Set<() => void>();

  function set(next: Toast[]) {
    toasts = next;
    listeners.forEach((listener) => listener());
  }

  return {
    getToasts: () => toasts,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show(options) {
      if (options.id && toasts.some((t) => t.id === options.id)) {
        return options.id;
      }
      nextId += 1;
      const id = options.id || `toast-${nextId}`;
      set([...toasts, {...options, id}]);
      return id;
    },
    update(options) {
      const index = toasts.findIndex((t) => t.id === options.id);
      if (index === -1) {
        return;
      }
      const next = [...toasts];
      next[index] = {...options};
      set(next);
    },
    hide(id) {
      const toast = toasts.find((t) => t.id === id);
      if (!toast) {
        return;
      }
      set(toasts.filter((t) => t !== toast));
      toast.onClose?.(toast);
    },
    clean() {
      set([]);
    },
  };
}

/** The app's toast store, rendered by the `Toaster` in the app shell. */
export const toastStore = createToastStore();

/** Shows a toast and returns its id. Same shape as Mantine's. */
export function showNotification(options: ToastOptions): string {
  return toastStore.show(options);
}

/** Replaces the toast with `options.id`. Same shape as Mantine's. */
export function updateNotification(options: ToastOptions & {id: string}) {
  toastStore.update(options);
}

/** Hides a toast. Same shape as Mantine's. */
export function hideNotification(id: string) {
  toastStore.hide(id);
}

/** Hides every toast. Same shape as Mantine's `cleanNotifications`. */
export function cleanNotifications() {
  toastStore.clean();
}

/** The status token set a toast is drawn with. */
export type ToastStatus = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Maps a Mantine color name onto a `ToastStatus`. */
export function toastStatus(color: string | undefined): ToastStatus {
  switch (color) {
    case 'red':
    case 'pink':
      return 'danger';
    case 'green':
    case 'teal':
    case 'lime':
      return 'success';
    case 'yellow':
    case 'orange':
      return 'warning';
    case 'blue':
    case 'cyan':
    case 'indigo':
      return 'info';
    default:
      return 'neutral';
  }
}
