import type {ComponentChildren, FunctionComponent, Ref, VNode} from 'preact';
import {forwardRef} from 'preact/compat';
import {useEffect, useId, useRef} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {isFocusVisible} from '../floating/focus.js';
import {Portal} from '../floating/Portal.js';
import {cloneTrigger, getElementRef} from '../floating/trigger.js';
import {useControllableState} from '../floating/useControllableState.js';
import {type Placement, useFloating} from '../floating/useFloating.js';

/** How long the pointer has to rest on an interactive tooltip's gap, in ms. */
const INTERACTIVE_CLOSE_DELAY = 150;

export interface TooltipProps {
  /**
   * The tooltip's text (or content). It supplements the trigger's own label
   * and is never the only way to tell what the trigger does: icon-only
   * triggers still need an `aria-label` (`IconButton`'s `label`).
   */
  label: ComponentChildren;
  /**
   * The trigger: a single element that forwards its ref and props, e.g. a
   * `<button>`, `Button` or `IconButton`. Disabled triggers work too.
   */
  children: VNode<any>;
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
  /** Controls visibility. Leave unset to show on hover and focus. */
  open?: boolean;
  /** Initial visibility when uncontrolled (galleries and tests). */
  defaultOpen?: boolean;
  /** Called when the tooltip wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /** Classes for the wrapper element around the trigger. */
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
 * A short label shown next to its trigger on hover and keyboard focus,
 * after a short delay. It hides on Escape, blur, pointer leave and press, and
 * never shows on tap. The trigger gets `aria-describedby` pointing at it.
 * Replaces Mantine's `Tooltip` and the old `ConditionalTooltip`.
 *
 * The trigger is wrapped in an `inline-flex` span (`Tooltip`), which is what
 * receives pointer events, so the tooltip also shows for disabled buttons.
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
  const triggerRef = useMergedRef<Element>(
    getElementRef(children),
    ref as Ref<Element>,
    setReference
  );

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

  // Skip `aria-describedby` when the tooltip just repeats the trigger's
  // accessible name (e.g. an IconButton labeled "Delete" with a "Delete"
  // tooltip), so screen readers don't say it twice.
  const childProps = children.props as Record<string, unknown>;
  const repeatsName =
    typeof label === 'string' &&
    (childProps['aria-label'] === label || childProps.label === label);
  const describedBy = [
    childProps['aria-describedby'] as string | undefined,
    !disabled && !repeatsName ? id : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const trigger = cloneTrigger(children, {
    ...triggerProps,
    ref: triggerRef,
    'aria-describedby': describedBy || undefined,
  });

  return (
    <span
      className={cn(
        'Tooltip inline-flex max-w-full *:disabled:pointer-events-none',
        className
      )}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch' && !disabled) {
          show();
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') {
          hide(interactive ? INTERACTIVE_CLOSE_DELAY : 0);
        }
      }}
      onPointerDown={() => hide()}
      onFocusIn={(e) => {
        if (!disabled && isFocusVisible(e.target as Element)) {
          show();
        }
      }}
      onFocusOut={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node) || !e.currentTarget.contains(next)) {
          hide();
        }
      }}
    >
      {trigger}
      {!disabled && (
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
                'Tooltip__content relative z-10 max-w-64 rounded-sm bg-strong px-2 py-1 font-sans text-sm leading-snug text-inverse shadow-md',
                contentClassName
              )}
            >
              {label}
            </div>
            <div
              ref={setArrow}
              className="Tooltip__arrow absolute size-2 rotate-45 bg-strong"
              aria-hidden="true"
            />
          </div>
        </Portal>
      )}
    </span>
  );
}) as unknown as FunctionComponent<TooltipProps & {ref?: Ref<Element>}>;
