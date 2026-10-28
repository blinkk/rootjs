import './Dialog.css';

import {IconX} from '@tabler/icons-preact';
import type {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {useId, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {IconButton} from '../IconButton/IconButton.js';
import {pushDialog, removeDialog} from './dialogStack.js';

/**
 * Width of the dialog from `md` up (below `md` it's always a full-width
 * bottom sheet). The named sizes match Mantine's `Modal`: `xs` 320px, `sm` 380px,
 * `md` 440px, `lg` 620px, `xl` 780px, `full` 100%, and `auto` (fits the
 * content). A number is pixels; any other string is a CSS width, e.g.
 * `'600px'` or `'min(calc(100% - 32px), 900px)'`.
 */
export type DialogSize =
  'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'auto' | number | (string & {});

const NAMED_SIZES: Record<string, string> = {
  xs: '320px',
  sm: '380px',
  md: '440px',
  lg: '620px',
  xl: '780px',
  full: '100%',
  auto: 'auto',
};

/** Resolves a `DialogSize` to a CSS width. */
export function dialogWidth(size: DialogSize): string {
  if (typeof size === 'number') {
    return `${size}px`;
  }
  return NAMED_SIZES[size] ?? size;
}

interface DialogOwnProps {
  /** Whether the dialog is shown. The dialog is controlled. */
  open: boolean;
  /**
   * Called when the user asks to close the dialog: the close button, Escape
   * or a backdrop click (unless disabled below). Set `open` to false in
   * response.
   */
  onClose: () => void;
  /** Heading, also the dialog's accessible name. */
  title?: ComponentChildren;
  /** A line of supporting text under the title. */
  description?: ComponentChildren;
  /** The body. Scrolls when it's taller than the screen. */
  children?: ComponentChildren;
  /**
   * Actions, right-aligned below the body (and pinned to the bottom of the
   * sheet on mobile), e.g. `<Button>Cancel</Button><Button
   * variant="primary">Save</Button>`.
   */
  footer?: ComponentChildren;
  /** Width from `md` up; see `DialogSize`. Default `md` (440px). */
  size?: DialogSize;
  /** Centers the dialog vertically from `md` up, instead of near the top. */
  centered?: boolean;
  /** Whether Escape closes the dialog. Default true. */
  closeOnEscape?: boolean;
  /** Whether clicking the backdrop closes the dialog. Default true. */
  closeOnClickOutside?: boolean;
  /** Whether to show the close button in the header. Default true. */
  withCloseButton?: boolean;
  /** Accessible name of the close button. Default "Close". */
  closeLabel?: string;
  /** Classes for the root `<dialog>` (which fills the viewport). */
  className?: string;
  /** Classes for the visible panel (`Dialog__panel`). */
  panelClassName?: string;
  /** Classes for the scrolling body (`Dialog__body`). */
  bodyClassName?: string;
}

export type DialogProps = DialogOwnProps &
  Omit<
    JSX.HTMLAttributes<HTMLDialogElement>,
    keyof DialogOwnProps | 'onCancel'
  >;

/**
 * A modal dialog, built on a native `<dialog>` opened with `showModal()`, so
 * the browser traps focus and makes the page behind it inert. Escape and
 * backdrop clicks call `onClose`, and focus returns to the element that
 * opened it. From `md` up it's a centered panel; below `md` it's a bottom
 * sheet that grows with its content up to near the top of the screen. Replaces Mantine's `Modal`.
 *
 * ```tsx
 * <Dialog
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Rename doc"
 *   footer={
 *     <>
 *       <Button onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button variant="primary" onClick={save}>Save</Button>
 *     </>
 *   }
 * >
 *   ...
 * </Dialog>
 * ```
 *
 * Elements with `data-autofocus` (or `autofocus`) get focus on open;
 * otherwise the browser focuses the first focusable element.
 */
export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(
  (props, forwardedRef) => {
    const {
      open,
      onClose,
      title,
      description,
      children,
      footer,
      size = 'md',
      centered = false,
      closeOnEscape = true,
      closeOnClickOutside = true,
      withCloseButton = true,
      closeLabel = 'Close',
      className,
      panelClassName,
      bodyClassName,
      ...rest
    } = props;
    const ref = useRef<HTMLDialogElement | null>(null);
    // Whether the dialog should be open, readable from native event handlers.
    const openRef = useRef(false);
    // The element focused before the dialog opened, to restore on close.
    const openerRef = useRef<HTMLElement | null>(null);
    // Whether the current click started on the backdrop.
    const pressedBackdropRef = useRef(false);
    const id = useId();
    const titleId = `${id}-title`;
    const descriptionId = `${id}-description`;
    const hasHeader = Boolean(title || description || withCloseButton);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [scrollable, setScrollable] = useState(false);

    // Keep the latest props for the native event handlers.
    const latest = useRef({onClose, closeOnEscape});
    latest.current = {onClose, closeOnEscape};

    function setRef(el: HTMLDialogElement | null) {
      ref.current = el;
      if (typeof forwardedRef === 'function') {
        forwardedRef(el);
      } else if (forwardedRef) {
        forwardedRef.current = el;
      }
    }

    function show(el: HTMLDialogElement) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      if (typeof el.showModal === 'function') {
        el.showModal();
      } else {
        // Environments without `<dialog>` support (e.g. jsdom).
        el.setAttribute('open', '');
      }
      pushDialog(el);
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }

    function hide(el: HTMLDialogElement) {
      openRef.current = false;
      if (el.open) {
        if (typeof el.close === 'function') {
          el.close();
        } else {
          el.removeAttribute('open');
        }
      }
      removeDialog(el);
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) {
        opener.focus();
      }
    }

    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) {
        return;
      }
      if (open && !openRef.current) {
        openRef.current = true;
        show(el);
      } else if (!open && openRef.current) {
        hide(el);
      }
    }, [open]);

    // A body that scrolls is made focusable, so keyboard users can scroll
    // it even when it holds nothing else focusable.
    useLayoutEffect(() => {
      const body = bodyRef.current;
      if (!open || !body) {
        return;
      }
      const measure = () =>
        setScrollable(body.scrollHeight > body.clientHeight + 1);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(body);
      Array.from(body.children).forEach((child) => observer.observe(child));
      return () => observer.disconnect();
    }, [open]);

    // Close (and restore focus) if unmounted while open.
    useLayoutEffect(() => {
      const el = ref.current;
      return () => {
        if (el && openRef.current) {
          hide(el);
        }
      };
    }, []);

    function onCancel(e: Event) {
      // Escape (or a platform back gesture). Closing is up to the owner.
      e.preventDefault();
      if (latest.current.closeOnEscape) {
        latest.current.onClose();
      }
    }

    function onNativeClose() {
      const el = ref.current;
      // The browser can close a dialog on its own, e.g. on a repeated
      // Escape after `cancel` was prevented. Keep it in sync with `open`.
      if (!el || el.open || !openRef.current) {
        return;
      }
      if (latest.current.closeOnEscape) {
        removeDialog(el);
        latest.current.onClose();
      } else {
        el.showModal();
      }
    }

    function onPointerDown(e: PointerEvent) {
      pressedBackdropRef.current = e.target === e.currentTarget;
    }

    function onClick(e: MouseEvent) {
      // The `<dialog>` fills the viewport around the panel, so a click whose
      // target is the dialog itself is a click on the backdrop. Clicks that
      // start inside the panel (e.g. selecting text) don't count.
      if (
        closeOnClickOutside &&
        pressedBackdropRef.current &&
        e.target === e.currentTarget
      ) {
        onClose();
      }
      pressedBackdropRef.current = false;
    }

    const sizeName =
      typeof size === 'string' && size in NAMED_SIZES ? size : 'custom';

    return (
      <dialog
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        {...rest}
        ref={setRef}
        onCancel={onCancel}
        onClose={onNativeClose}
        onPointerDown={onPointerDown}
        onClick={onClick}
        className={cn(
          'Dialog',
          `Dialog--size-${sizeName}`,
          centered && 'Dialog--centered',
          'm-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent px-0 pb-0 font-sans text-fg backdrop:bg-overlay',
          'open:flex items-end justify-center md:items-start md:px-4 md:py-16',
          centered && 'md:items-center',
          className
        )}
      >
        <div
          className={cn(
            'Dialog__panel flex max-h-full max-w-full flex-col rounded-t-xl bg-surface shadow-lg md:rounded-lg md:border md:border-border',
            panelClassName
          )}
          style={{'--Dialog-width': dialogWidth(size)}}
        >
          {hasHeader && (
            <div className="Dialog__header flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
              <div className="Dialog__heading flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                {title && (
                  <h2
                    id={titleId}
                    className="Dialog__title m-0 break-words text-lg font-semibold leading-snug text-strong"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descriptionId}
                    className="Dialog__description m-0 text-base text-muted"
                  >
                    {description}
                  </p>
                )}
              </div>
              {withCloseButton && (
                <IconButton
                  label={closeLabel}
                  className="Dialog__close -mr-1.5"
                  onClick={() => onClose()}
                >
                  <IconX />
                </IconButton>
              )}
            </div>
          )}
          <div
            ref={bodyRef}
            tabIndex={scrollable ? 0 : undefined}
            className={cn(
              'Dialog__body min-h-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus flex-1 overflow-y-auto break-words px-5 pb-5 text-base',
              !hasHeader && 'pt-5',
              bodyClassName
            )}
          >
            {children}
          </div>
          {footer && (
            <div className="Dialog__footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </dialog>
    );
  }
) as unknown as FunctionComponent<DialogProps & {ref?: Ref<HTMLDialogElement>}>;
