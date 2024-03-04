export function throttle(callback: (...args: any[]) => void, timeout: number) {
  let isThrottled = false;
  return (...args: any[]) => {
    if (isThrottled) {
      return;
    }
    callback(...args);
    isThrottled = true;
    setTimeout(() => {
      isThrottled = false;
    }, timeout);
  };
}
