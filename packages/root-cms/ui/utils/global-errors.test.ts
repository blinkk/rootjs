import {showNotification} from '@mantine/notifications';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {installGlobalErrorHandlers} from './global-errors.js';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const showNotificationMock = vi.mocked(showNotification);

/**
 * Dispatches a window `error` event. jsdom's ErrorEvent constructor doesn't
 * populate `error` from the init dict in all versions, so it's assigned
 * explicitly.
 */
function dispatchError(message: string, error?: unknown) {
  const event = new Event('error') as any;
  event.message = message;
  event.error = error ?? new Error(message);
  window.dispatchEvent(event);
}

/** Dispatches a window `unhandledrejection` event with the given reason. */
function dispatchRejection(reason: unknown) {
  const event = new Event('unhandledrejection') as any;
  event.reason = reason;
  window.dispatchEvent(event);
}

describe('installGlobalErrorHandlers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    showNotificationMock.mockClear();
    // The module installs its listeners once; calling it again is a no-op.
    installGlobalErrorHandlers();
  });

  it('shows a notification for an uncaught error', () => {
    dispatchError('kaboom');
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNotificationMock.mock.calls[0][0]).toMatchObject({
      title: 'Something went wrong',
      message: 'kaboom',
      color: 'red',
    });
  });

  it('shows a notification for an unhandled promise rejection', () => {
    dispatchRejection(new Error('rejected'));
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNotificationMock.mock.calls[0][0]).toMatchObject({
      title: 'Something went wrong',
      message: 'rejected',
    });
  });

  it('dedupes repeated identical errors', () => {
    dispatchError('repeated failure');
    dispatchError('repeated failure');
    dispatchError('repeated failure');
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('shows distinct errors separately', () => {
    dispatchError('first failure');
    dispatchError('second failure');
    expect(showNotificationMock).toHaveBeenCalledTimes(2);
  });

  it('ignores noisy browser-generated errors', () => {
    dispatchError(
      'ResizeObserver loop completed with undelivered notifications.'
    );
    dispatchError('Script error.');
    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it('ignores resource load errors that target an element', () => {
    const event = new Event('error') as any;
    event.message = 'load failed';
    Object.defineProperty(event, 'target', {
      value: document.createElement('img'),
    });
    window.dispatchEvent(event);
    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});
