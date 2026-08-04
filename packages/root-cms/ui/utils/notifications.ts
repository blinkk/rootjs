import {showNotification} from '@mantine/notifications';

/**
 * Extracts a human-readable error message from an unknown error value.
 */
export function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    // Firebase errors often have a `code` and `message` property.
    if (typeof obj.code === 'string' && typeof obj.message === 'string') {
      return `${obj.code}: ${obj.message}`;
    }
    if (typeof obj.body === 'string') {
      return obj.body;
    }
    if (typeof obj.message === 'string') {
      return obj.message;
    }
  }
  return String(err);
}

/**
 * How long an identical error is suppressed after being shown. Errors thrown
 * from editor listeners and event handlers tend to repeat on every keystroke,
 * which would otherwise bury the screen in identical notifications.
 */
const DEDUPE_WINDOW_MS = 10000;

/** Timestamp of the last notification shown, keyed by title + message. */
const lastShownAt = new Map<string, number>();

export interface ShowErrorNotificationOptions {
  /** Notification title. Defaults to "Error". */
  title?: string;
  /**
   * Whether to suppress the notification if an identical one was already shown
   * within the dedupe window. Defaults to true.
   */
  dedupe?: boolean;
}

/**
 * Shows an error notification for an unknown error value. The error is always
 * logged to the console; the notification itself is deduped so a repeating
 * error doesn't flood the screen.
 *
 * Usage:
 * ```
 * showErrorNotification(err, {title: 'Rich text editor error'});
 * ```
 */
export function showErrorNotification(
  err: unknown,
  options?: ShowErrorNotificationOptions
) {
  const title = options?.title || 'Error';
  console.error(err);
  const message = errorMessage(err);
  if (options?.dedupe !== false) {
    const key = `${title}:${message}`;
    const now = Date.now();
    const prev = lastShownAt.get(key);
    if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) {
      return;
    }
    lastShownAt.set(key, now);
  }
  // Never let a failure to notify take down the caller, which may itself be an
  // error handler.
  try {
    showNotification({
      title: title,
      message: message,
      color: 'red',
      autoClose: false,
    });
  } catch (notifyErr) {
    console.error('failed to show error notification:', notifyErr);
  }
}

/**
 * Wrapper that calls a function and shows a generic error notification if any
 * exceptions occur.
 */
export async function notifyErrors(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    showErrorNotification(err, {dedupe: false});
  }
}
