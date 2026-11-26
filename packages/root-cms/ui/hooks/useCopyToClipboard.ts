import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {showNotification} from '../primitives/Toast/toastStore.js';
import {showErrorNotification} from '../utils/notifications.js';

/** Options for `useCopyToClipboard()`. */
export interface UseCopyToClipboardOptions {
  /** How long `copied` stays true after a successful copy, in ms. Default 2000. */
  timeoutMs?: number;
  /** Optional success toast to show on copy. */
  successToast?: {title?: string; message: string; autoClose?: number};
  /** Optional error toast title when clipboard write fails. */
  errorTitle?: string;
}

/** Return value of `useCopyToClipboard()`. */
export interface UseCopyToClipboardResult {
  /** True briefly after `copy()` succeeds. */
  copied: boolean;
  /** Copies `text` to the clipboard. Returns true on success. */
  copy: (text: string) => Promise<boolean>;
}

/**
 * Copies text to the system clipboard with a timed `copied` state (cleaned up
 * on unmount) and optional success/error toast notifications.
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardResult {
  const {timeoutMs = 2000, successToast, errorTitle} = options;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const optionsRef = useRef({timeoutMs, successToast, errorTitle});
  optionsRef.current = {timeoutMs, successToast, errorTitle};

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, optionsRef.current.timeoutMs);
      if (optionsRef.current.successToast) {
        showNotification({
          title: optionsRef.current.successToast.title,
          message: optionsRef.current.successToast.message,
          autoClose: optionsRef.current.successToast.autoClose ?? 3000,
        });
      }
      return true;
    } catch (err) {
      if (optionsRef.current.errorTitle) {
        showErrorNotification(err, {title: optionsRef.current.errorTitle});
      } else {
        console.error('Failed to copy to clipboard:', err);
      }
      return false;
    }
  }, []);

  return {copied, copy};
}
