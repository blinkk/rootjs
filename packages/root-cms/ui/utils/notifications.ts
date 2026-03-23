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
 * Wrapper that calls a function and shows a generic error notification if any
 * exceptions occur.
 */
export async function notifyErrors(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    const msg = errorMessage(err);
    showNotification({
      title: 'Error',
      message: msg,
      color: 'red',
      autoClose: false,
    });
  }
}
