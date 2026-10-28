import './Toast.css';

import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {createPortal} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {useOverlayRoot} from '../Dialog/dialogStack.js';
import {IconButton} from '../IconButton/IconButton.js';
import {Spinner} from '../Spinner/Spinner.js';
import {
  type Toast as ToastData,
  type ToastStatus,
  type ToastStore,
  toastStatus,
  toastStore,
} from './toastStore.js';

const ACCENT_CLASSES: Record<ToastStatus, string> = {
  neutral: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const ICON_CLASSES: Record<ToastStatus, string> = {
  neutral: 'text-fg',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** Status icons, so status isn't conveyed by color alone. */
const STATUS_ICONS: Record<ToastStatus, ComponentChildren> = {
  neutral: null,
  info: <IconInfoCircle />,
  success: <IconCircleCheck />,
  warning: <IconAlertTriangle />,
  danger: <IconAlertCircle />,
};

export interface ToastProps {
  toast: ToastData;
  /** Auto-close delay used when the toast doesn't set a number. */
  defaultAutoClose: number | false;
  /** Called to hide the toast (dismissed or timed out). */
  onHide: (id: string) => void;
}

/** Resolves a toast's auto-close delay, like Mantine's `getAutoClose`. */
function autoCloseDelay(
  toast: ToastData,
  defaultAutoClose: number | false
): number | false {
  if (typeof toast.autoClose === 'number') {
    return toast.autoClose;
  }
  if (toast.autoClose === false) {
    return false;
  }
  return defaultAutoClose;
}

/**
 * One toast. Rendered by `Toaster`; exported for custom layouts. Its
 * auto-close timer pauses while it's hovered or focused.
 */
export function Toast(props: ToastProps) {
  const {toast, onHide} = props;
  const status = toastStatus(toast.color);
  const delay = autoCloseDelay(toast, props.defaultAutoClose);
  const timerRef = useRef<number | undefined>(undefined);
  const remainingRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const pausedRef = useRef({hover: false, focus: false});

  function start() {
    window.clearTimeout(timerRef.current);
    if (delay === false) {
      return;
    }
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(
      () => onHide(toast.id),
      remainingRef.current
    );
  }

  function pause(reason: 'hover' | 'focus') {
    const wasRunning = !pausedRef.current.hover && !pausedRef.current.focus;
    pausedRef.current[reason] = true;
    if (wasRunning && delay !== false) {
      window.clearTimeout(timerRef.current);
      remainingRef.current -= Date.now() - startedAtRef.current;
    }
  }

  function resume(reason: 'hover' | 'focus') {
    pausedRef.current[reason] = false;
    if (!pausedRef.current.hover && !pausedRef.current.focus) {
      start();
    }
  }

  useEffect(() => {
    toast.onOpen?.(toast);
  }, []);

  // (Re)start the timer when shown, and whenever the toast is updated.
  useEffect(() => {
    remainingRef.current = delay === false ? 0 : delay;
    if (!pausedRef.current.hover && !pausedRef.current.focus) {
      start();
    }
    return () => window.clearTimeout(timerRef.current);
  }, [toast, delay]);

  const icon = toast.loading ? (
    <Spinner label={null} />
  ) : (
    (toast.icon ?? STATUS_ICONS[status])
  );

  return (
    <div
      className={cn(
        'Toast',
        `Toast--status-${status}`,
        'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-border bg-surface py-3 pl-4 pr-3 text-base text-fg shadow-lg',
        toast.className
      )}
      role={status === 'danger' ? 'alert' : undefined}
      aria-busy={toast.loading || undefined}
      onMouseEnter={() => pause('hover')}
      onMouseLeave={() => resume('hover')}
      onFocusIn={() => pause('focus')}
      onFocusOut={(e: FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !(e.currentTarget as Node).contains(next)) {
          resume('focus');
        }
      }}
    >
      <span
        className={cn(
          'Toast__accent absolute inset-y-0 left-0 w-1',
          ACCENT_CLASSES[status]
        )}
        aria-hidden="true"
      />
      {icon && (
        <span
          className={cn(
            'Toast__icon flex shrink-0 pt-0.5 *:size-4',
            ICON_CLASSES[status]
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="Toast__content flex min-w-0 flex-1 flex-col gap-0.5 break-words">
        {toast.title && (
          <div className="Toast__title font-semibold leading-snug text-strong">
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div
            className={cn(
              'Toast__message leading-snug',
              toast.title ? 'text-muted' : 'text-fg',
              typeof toast.message === 'string' && 'line-clamp-3'
            )}
          >
            {toast.message}
          </div>
        )}
      </div>
      {!toast.disallowClose && (
        <IconButton
          label="Dismiss notification"
          size="xs"
          className="Toast__close -my-0.5"
          onClick={() => onHide(toast.id)}
        >
          <IconX />
        </IconButton>
      )}
    </div>
  );
}

export interface ToasterProps {
  /** The store to render. Default: the app's shared `toastStore`. */
  store?: ToastStore;
  /**
   * How many toasts show at once; the rest wait their turn. Default 5, as
   * in Mantine.
   */
  limit?: number;
  /** Default auto-close delay in ms, or `false`. Default 4000. */
  autoClose?: number | false;
  /** Accessible name of the toast region. Default "Notifications". */
  label?: string;
}

/**
 * Renders the toasts shown with `showNotification()`: a stack in the
 * bottom-right corner from `md` up, full width along the bottom below `md`.
 * New toasts are announced politely, errors (`color: 'red'`) assertively.
 * Mount one in the app shell; replaces Mantine's `NotificationsProvider`.
 *
 * It portals into the topmost open `Dialog`, if any, so toasts stay above
 * modals and clickable.
 */
export function Toaster(props: ToasterProps) {
  const store = props.store ?? toastStore;
  const limit = props.limit ?? 5;
  const defaultAutoClose = props.autoClose ?? 4000;
  const [toasts, setToasts] = useState(() => store.getToasts());
  const root = useOverlayRoot();

  useEffect(() => {
    setToasts(store.getToasts());
    return store.subscribe(() => setToasts(store.getToasts()));
  }, [store]);

  return createPortal(
    <section
      aria-label={props.label ?? 'Notifications'}
      className="Toaster pointer-events-none fixed inset-x-0 bottom-0 z-(--cms-z-toast) font-sans md:left-auto md:w-110 md:max-w-full"
    >
      <div
        className="Toaster__list flex flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.slice(0, limit).map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            defaultAutoClose={defaultAutoClose}
            onHide={(id) => store.hide(id)}
          />
        ))}
      </div>
    </section>,
    root
  );
}
