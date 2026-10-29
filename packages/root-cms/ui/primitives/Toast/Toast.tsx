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
import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
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
  /**
   * Set once the toast has been hidden: it plays its exit animation, then
   * calls `onExited`.
   */
  leaving?: boolean;
  /** Called when the exit animation ends. */
  onExited?: (id: string) => void;
}

/** Whether to animate: skipped for reduced motion and in jsdom. */
function canAnimate(el: HTMLElement | null): el is HTMLElement {
  return (
    !!el &&
    typeof el.animate === 'function' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Toasts slide in from off-screen right from `md` up, and up from the bottom
 * below, as in Mantine.
 */
function enterOffset() {
  return window.matchMedia('(width >= 48rem)').matches
    ? 'translateX(150%)'
    : 'translateY(100%)';
}

/** How long a toast takes to slide in or out, in ms (Mantine's 250). */
const TRANSITION_DURATION = 250;

/**
 * Keyframes for a toast slid out and collapsed to no height, so the toasts
 * around it move over to make (or take back) its space, and for the toast
 * at rest.
 */
function slideKeyframes(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  // Also cancels (or restores) the list's gap next to the toast.
  const gapSide = el.previousElementSibling ? 'marginTop' : 'marginBottom';
  const hidden = {
    opacity: 0,
    transform: enterOffset(),
    height: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
    [gapSide]: '-8px',
  };
  const shown = {
    opacity: 1,
    transform: 'none',
    height: `${el.offsetHeight}px`,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    borderTopWidth: style.borderTopWidth,
    borderBottomWidth: style.borderBottomWidth,
    [gapSide]: '0px',
  };
  return {hidden, shown};
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
  const {toast, onHide, leaving = false, onExited} = props;
  const ref = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const el = ref.current;
    // A toast hidden as it's shown (it remounts to leave) skips straight to
    // its exit.
    if (!leaving && canAnimate(el)) {
      const {hidden, shown} = slideKeyframes(el);
      el.animate([hidden, shown], {
        duration: TRANSITION_DURATION,
        easing: 'ease',
      });
    }
  }, []);

  // Exit: slide out while collapsing the space it took, so the toasts around
  // it slide into place.
  useLayoutEffect(() => {
    if (!leaving) {
      return;
    }
    window.clearTimeout(timerRef.current);
    const el = ref.current;
    if (!canAnimate(el)) {
      onExited?.(toast.id);
      return;
    }
    // Measured at rest, not partway through the enter animation.
    el.getAnimations().forEach((a) => a.cancel());
    const {hidden, shown} = slideKeyframes(el);
    const anim = el.animate([shown, hidden], {
      duration: TRANSITION_DURATION,
      easing: 'ease',
      fill: 'forwards',
    });
    anim.onfinish = () => onExited?.(toast.id);
    return () => anim.cancel();
  }, [leaving]);

  // (Re)start the timer when shown, and whenever the toast is updated.
  useEffect(() => {
    if (leaving) {
      return undefined;
    }
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
      ref={ref}
      aria-hidden={leaving || undefined}
      className={cn(
        'Toast',
        `Toast--status-${status}`,
        leaving && 'Toast--leaving pointer-events-none',
        'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-border bg-surface py-3 pl-5.5 pr-3 text-base text-fg shadow-lg',
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
          'Toast__accent absolute inset-y-1 left-1 w-1.5 rounded-full',
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
  // Hidden toasts stay rendered, where they were, until their exit
  // animation ends.
  const [leaving, setLeaving] = useState<
    Array<{toast: ToastData; index: number}>
  >([]);
  const shownRef = useRef<ToastData[]>([]);
  const root = useOverlayRoot();

  useEffect(() => {
    setToasts(store.getToasts());
    return store.subscribe(() => setToasts(store.getToasts()));
  }, [store]);

  const shown = toasts.slice(0, limit);
  useLayoutEffect(() => {
    const ids = new Set(shown.map((t) => t.id));
    const gone = shownRef.current
      .map((toast, index) => ({toast, index}))
      .filter(({toast}) => !ids.has(toast.id));
    shownRef.current = shown;
    if (gone.length > 0) {
      setLeaving((current) => [
        ...current.filter(({toast}) => !ids.has(toast.id)),
        ...gone,
      ]);
    }
  }, [toasts, limit]);

  const items = shown.map((toast) => ({toast, leaving: false}));
  leaving
    .filter(({toast}) => !items.some((item) => item.toast.id === toast.id))
    .sort((a, b) => a.index - b.index)
    .forEach(({toast, index}) => {
      items.splice(Math.min(index, items.length), 0, {toast, leaving: true});
    });

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
        {items.map(({toast, leaving: isLeaving}) => (
          <Toast
            key={toast.id}
            toast={toast}
            defaultAutoClose={defaultAutoClose}
            onHide={(id) => store.hide(id)}
            leaving={isLeaving}
            onExited={(id) =>
              setLeaving((current) =>
                current.filter(({toast: t}) => t.id !== id)
              )
            }
          />
        ))}
      </div>
    </section>,
    root
  );
}
