export function debounce(callback: (...args: any[]) => void, timeout: number) {
  let timeoutId: number | undefined;
  return (...args: any[]) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, timeout);
  };
}
