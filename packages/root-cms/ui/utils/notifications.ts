import {showNotification} from '@mantine/notifications';

/**
 * Wrapper that calls a function and shows a generic error notification if any
 * exceptions occur.
 */
export async function notifyErrors(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    let msg: string;
    if (typeof err === 'object' && err.body) {
      msg = String(err.body);
    } else {
      msg = String(err);
    }
    showNotification({
      title: 'Error',
      message: msg,
      color: 'red',
      autoClose: false,
    });
  }
}
