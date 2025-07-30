export const requestIdleCallbackPolyfill =
  typeof window !== 'undefined' && window.requestIdleCallback
    ? window.requestIdleCallback
    : function (cb: IdleRequestCallback) {
        const start = Date.now();
        return setTimeout(() => {
          cb({
            didTimeout: false,
            timeRemaining: function () {
              return Math.max(0, 50 - (Date.now() - start));
            },
          });
        }, 1);
      };

export const cancelIdleCallbackPolyfill =
  typeof window !== 'undefined' && window.cancelIdleCallback
    ? window.cancelIdleCallback
    : function (id: number | NodeJS.Timeout) {
        clearTimeout(id);
      };
