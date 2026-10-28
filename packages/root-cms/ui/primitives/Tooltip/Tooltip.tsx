import type {ComponentChildren, FunctionComponent, Ref, VNode} from 'preact';
import {forwardRef, isValidElement} from 'preact/compat';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {isFocusVisible} from '../floating/focus.js';
import {Portal} from '../floating/Portal.js';
import {cloneTrigger, getElementRef} from '../floating/trigger.js';
import {useControllableState} from '../floating/useControllableState.js';
import {type Placement, useFloating} from '../floating/useFloating.js';

/** How long the pointer has to rest on an interactive tooltip's gap, in ms. */
const INTERACTIVE_CLOSE_DELAY = 150;

/** The `$$typeof` that `forwardRef` (from `preact/compat`) sets. */
const FORWARD_REF = Symbol.for('react.forward_ref');

/** Matches a trigger that can't take pointer events or focus. */
const DISABLED_SELECTOR = ':disabled, [aria-disabled="true"]';

export interface TooltipProps {
  /**
   * The tooltip's text (or content). It supplements the trigger's own label
   * and is never the only way to tell what the trigger does: icon-only
   * triggers still need an `aria-label` (`IconButton`'s `label`).
   */
  label: ComponentChildren;
  /**
   * The trigger: a single element that forwards its ref and props, e.g. a
   * `<button>`, `Button` or `IconButton`. Disabled triggers work too. Other
   * children (text, or a component that doesn't forward its ref) are
   * wrapped in a span.
   */
  children: ComponentChildren;
  /** Preferred side; it flips when there isn't room. Default `top`. */
  placement?: Placement;
  /**
   * Turns the tooltip off and renders just the trigger. Covers the old
   * `ConditionalTooltip`: `disabled={!reason}`.
   */
  disabled?: boolean;
  /** Delay before showing, in ms. Default 100. */
  delay?: number;
  /**
   * Keeps the tooltip open while the pointer is over it, so its content can
   * be selected (e.g. an email address). Default `false`.
   */
  interactive?: boolean;
  /** Shows the arrow pointing at the trigger. Default `true`. */
  withArrow?: boolean;
  /** Controls visibility. Leave unset to show on hover and focus. */
  open?: boolean;
  /** Initial visibility when uncontrolled (galleries and tests). */
  defaultOpen?: boolean;
  /** Called when the tooltip wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Classes merged onto the trigger (or onto the wrapper span, when the
   * trigger has to be wrapped).
   */
  className?: string;
  /** Classes for the tooltip bubble. */
  contentClassName?: string;
  /**
   * Any other props (and the ref) are passed to the trigger, so a Tooltip
   * can itself be the trigger of a `Menu` or `Popover`.
   */
  [prop: string]: unknown;
}

/**
 * Whether a child is a single element whose ref resolves to a DOM element:
 * a DOM element itself, or a `forwardRef` (or memoized `forwardRef`)
 * component.
 */
function canTakeRef(child: ComponentChildren): child is VNode<any> {
  if (!isValidElement(child)) {
    return false;
  }
  const type = (child as VNode<any>).type as any;
  return (
    typeof type === 'string' ||
    type?.$$typeof === FORWARD_REF ||
    type?.type?.$$typeof === FORWARD_REF
  );
}

/**
 * A short label shown next to its trigger on hover and keyboard focus,
 * after a short delay. It hides on Escape, blur, pointer leave and press, and
 * never shows on tap. The trigger gets `aria-describedby` pointing at it.
 * Replaces Mantine's `Tooltip` and the old `ConditionalTooltip`.
 *
 * The tooltip attaches to the trigger directly, so the trigger keeps its own
 * layout (`absolute`, `float-right`, `w-full`, …). Disabled triggers, which
 * get no pointer events, are hit-tested from the document instead. Only
 * text, or a component that doesn't forward its ref, is wrapped in an
 * `inline-flex` span (`Tooltip`).
 *
 * ```tsx
 * <Tooltip label="Delete">
 *   <IconButton label="Delete" onClick={remove}><IconTrash /></IconButton>
 * </Tooltip>
 * <Tooltip label="You don't have access to publish" disabled={canPublish}>
 *   <Button disabled={!canPublish}>Publish</Button>
 * </Tooltip>
 * ```
 */
export const Tooltip = forwardRef<Element, TooltipProps>((props, ref) => {
  const {
    label,
    children,
    placement = 'top',
    disabled = false,
    delay = 100,
    interactive = false,
    withArrow = true,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    className,
    contentClassName,
    ...triggerProps
  } = props;
  const id = useId();
  const [openState, setOpen] = useControllableState(
    openProp,
    defaultOpen,
    onOpenChange
  );
  const open = openState && !disabled;
  const timerRef = useRef<number | undefined>(undefined);
  const {setReference, setFloating, setArrow} = useFloating({
    open,
    placement,
    offset: 8,
  });

  const refable = canTakeRef(children);
  // Set when a "refable" child's ref didn't resolve to a DOM element after
  // all (e.g. it forwards the ref to a component instance).
  const [refFailed, setRefFailed] = useState(false);
  const wrapped = !refable || refFailed;
  const triggerElRef = useRef<Element | null>(null);
  const [triggerEl, setTriggerEl] = useState<Element | null>(null);
  const [wrapperEl, setWrapperEl] = useState<HTMLElement | null>(null);
  const setTriggerDom = useCallback((el: unknown) => {
    const domEl = el instanceof Element ? el : null;
    triggerElRef.current = domEl;
    setTriggerEl(domEl);
  }, []);
  const triggerRef = useMergedRef<Element>(
    refable ? getElementRef(children) : undefined,
    ref as Ref<Element>,
    setTriggerDom
  );

  useLayoutEffect(() => {
    if (refable && !refFailed && !triggerElRef.current) {
      setRefFailed(true);
    }
  }, [refable, refFailed]);

  // What the tooltip points at, and what takes the hover and focus events.
  const anchor = wrapped ? (triggerEl ?? wrapperEl) : triggerEl;
  const hoverTarget = wrapped ? wrapperEl : triggerEl;

  useLayoutEffect(() => {
    setReference(anchor);
  }, [anchor]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Escape hides the tooltip, without stopping the key from also closing a
  // dialog or menu it's in.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  function show(wait = delay) {
    window.clearTimeout(timerRef.current);
    if (wait <= 0) {
      setOpen(true);
      return;
    }
    timerRef.current = window.setTimeout(() => setOpen(true), wait);
  }

  function hide(wait = 0) {
    window.clearTimeout(timerRef.current);
    if (wait <= 0) {
      if (openState) {
        setOpen(false);
      }
      return;
    }
    timerRef.current = window.setTimeout(() => setOpen(false), wait);
  }

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && !disabled) {
      show();
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      hide(interactive ? INTERACTIVE_CLOSE_DELAY : 0);
    }
  };
  const onFocusIn = (e: FocusEvent) => {
    if (!disabled && isFocusVisible(e.target as Element)) {
      show();
    }
  };
  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget;
    const target = e.currentTarget as Element;
    if (!(next instanceof Node) || !target.contains(next)) {
      hide();
    }
  };

  // The listeners always call the latest render's handlers.
  const handlersRef = useRef({onEnter, onLeave, onFocusIn, onFocusOut, hide});
  handlersRef.current = {onEnter, onLeave, onFocusIn, onFocusOut, hide};

  useEffect(() => {
    if (!hoverTarget) {
      return undefined;
    }
    const h = handlersRef;
    const listeners: Array<[string, (e: any) => void]> = [
      ['pointerenter', (e) => h.current.onEnter(e)],
      ['pointerleave', (e) => h.current.onLeave(e)],
      ['pointerdown', () => h.current.hide()],
      ['focusin', (e) => h.current.onFocusIn(e)],
      ['focusout', (e) => h.current.onFocusOut(e)],
    ];
    listeners.forEach(([type, fn]) => hoverTarget.addEventListener(type, fn));
    return () =>
      listeners.forEach(([type, fn]) =>
        hoverTarget.removeEventListener(type, fn)
      );
  }, [hoverTarget]);

  // A disabled trigger gets no pointer events (browsers drop them, and
  // `Button` sets `pointer-events: none`), so while it's disabled, hit-test
  // it from the document instead.
  useEffect(() => {
    if (wrapped || !triggerEl || disabled) {
      return undefined;
    }
    const el = triggerEl as HTMLElement;
    let inside = false;
    let setPointerEvents = false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        return;
      }
      const r = el.getBoundingClientRect();
      const now =
        e.clientX >= r.left &&
        e.clientX < r.right &&
        e.clientY >= r.top &&
        e.clientY < r.bottom;
      if (now !== inside) {
        inside = now;
        if (now) {
          handlersRef.current.onEnter(e);
        } else {
          handlersRef.current.onLeave(e);
        }
      }
    };
    const sync = () => {
      const isDisabled = el.matches(DISABLED_SELECTOR);
      if (isDisabled) {
        // Let the events through to the document, as the old wrapper did.
        if (!el.style.pointerEvents) {
          el.style.pointerEvents = 'none';
          setPointerEvents = true;
        }
        document.addEventListener('pointermove', onMove, {passive: true});
      } else {
        if (setPointerEvents) {
          el.style.pointerEvents = '';
          setPointerEvents = false;
        }
        document.removeEventListener('pointermove', onMove);
        inside = false;
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled'],
    });
    return () => {
      observer.disconnect();
      document.removeEventListener('pointermove', onMove);
      if (setPointerEvents) {
        el.style.pointerEvents = '';
      }
    };
  }, [wrapped, triggerEl, disabled]);

  // Skip `aria-describedby` when the tooltip just repeats the trigger's
  // accessible name (e.g. an IconButton labeled "Delete" with a "Delete"
  // tooltip), so screen readers don't say it twice.
  const childProps = (
    isValidElement(children) ? (children as VNode<any>).props : {}
  ) as Record<string, unknown>;
  const repeatsName =
    typeof label === 'string' &&
    (childProps['aria-label'] === label || childProps.label === label);
  const describedBy = [
    childProps['aria-describedby'] as string | undefined,
    !disabled && !repeatsName ? id : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const trigger = isValidElement(children)
    ? cloneTrigger(children as VNode<any>, {
        ...triggerProps,
        ref: triggerRef,
        'aria-describedby': describedBy || undefined,
        ...(!wrapped && className
          ? {className: cn(childProps.className as string, className)}
          : {}),
      })
    : children;

  const bubble = !disabled && (
    <Portal>
      <div
        ref={setFloating}
        hidden={!open}
        className={cn(
          'Tooltip__floating z-(--cms-z-tooltip) w-max',
          !interactive && 'pointer-events-none'
        )}
        onPointerEnter={interactive ? () => show(0) : undefined}
        onPointerLeave={
          interactive ? () => hide(INTERACTIVE_CLOSE_DELAY) : undefined
        }
      >
        <div
          id={id}
          role="tooltip"
          className={cn(
            'Tooltip__content relative z-10 max-w-64 rounded-sm bg-strong px-2.5 py-1.25 font-sans text-sm font-semibold leading-normal text-inverse shadow-md',
            contentClassName
          )}
        >
          {label}
        </div>
        {withArrow && (
          <div
            ref={setArrow}
            className="Tooltip__arrow absolute size-2 rotate-45 bg-strong"
            aria-hidden="true"
          />
        )}
      </div>
    </Portal>
  );

  if (!wrapped) {
    return (
      <>
        {trigger}
        {bubble}
      </>
    );
  }
  return (
    <span
      ref={setWrapperEl}
      className={cn(
        'Tooltip inline-flex max-w-full *:disabled:pointer-events-none',
        className
      )}
    >
      {trigger}
      {bubble}
    </span>
  );
}) as unknown as FunctionComponent<TooltipProps & {ref?: Ref<Element>}>;
