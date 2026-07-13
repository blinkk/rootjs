/**
 * Default max time to wait for a data request that gates a loading indicator.
 * Requests that exceed this are treated as failed so the UI can surface an
 * error instead of spinning forever, e.g. when a Firestore channel gets into
 * a stuck state and requests never settle.
 */
export const DATA_FETCH_TIMEOUT_MS = 30 * 1000;

/** Error thrown when a promise exceeds its deadline. */
export class TimeoutError extends Error {}

/**
 * Rejects with a `TimeoutError` if the promise doesn't settle within
 * `timeoutMs`. The underlying promise's eventual rejection (if any) is still
 * consumed so it doesn't surface as an unhandled rejection.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  label?: string
): Promise<T> {
  const ms = timeoutMs ?? DATA_FETCH_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new TimeoutError(
          `${label || 'request'} timed out after ${Math.round(
            ms / 1000
          )}s. Check your network connection and try reloading the page.`
        )
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
