import type {ComponentChildren, JSX, VNode} from 'preact';
import {useId} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {getTabbables, trapTabKey, useOverlayFocus} from '../floating/focus.js';
import {Portal} from '../floating/Portal.js';
import {cloneTrigger, getElementRef} from '../floating/trigger.js';
import {useControllableState} from '../floating/useControllableState.js';
import {useDismiss} from '../floating/useDismiss.js';
import {type Placement, useFloating} from '../floating/useFloating.js';

export interface PopoverProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'label' | 'width'
> {
  /**
   * The element that toggles the popover on click: a single element that
   * forwards its ref and props, e.g. a `<button>`, `Button` or `IconButton`
   * (optionally inside a `Tooltip`). It gets `aria-expanded`,
   * `aria-haspopup` and `aria-controls`.
   */
  trigger: VNode<any>;
  /** The popover's content. */
  children: ComponentChildren;
  /** Preferred side and alignment; it flips when there isn't room. Default `bottom`. */
  placement?: Placement;
  /** Controls visibility. Leave unset for an uncontrolled popover. */
  open?: boolean;
  /** Initial visibility when uncontrolled. */
  defaultOpen?: boolean;
  /** Called when the popover wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Width in px. It never exceeds the screen, so a 420px popover is 359px
   * wide on a 375px phone. Default: sized to the content.
   */
  width?: number;
  /**
   * The popover's accessible name, e.g. "Assign task". Defaults to the
   * trigger's name.
   */
  label?: string;
  /**
   * Keeps Tab inside the popover while it's open. Set `false` for popovers
   * that sit beside the page's flow (e.g. a comments panel). Default `true`.
   */
  trapFocus?: boolean;
  /** Close on a press outside the popover and its trigger. Default `true`. */
  closeOnOutsideClick?: boolean;
  /** Classes for the popover panel. */
  className?: string;
}

/**
 * A non-modal panel anchored to a trigger, opened and closed by clicking
 * the trigger. Escape and outside clicks close it. Opening moves focus to its
 * first focusable element (or the panel itself), and closing returns focus
 * to the trigger. Replaces Mantine's `Popover`.
 *
 * ```tsx
 * <Popover
 *   label="Assign task"
 *   trigger={<Button icon={<IconUser />}>Assign</Button>}
 *   open={open}
 *   onOpenChange={setOpen}
 *   width={280}
 * >
 *   <UserPicker onSelect={(email) => { assign(email); setOpen(false); }} />
 * </Popover>
 * ```
 */
export function Popover(props: PopoverProps) {
  const {
    trigger,
    children,
    placement = 'bottom',
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    width,
    label,
    trapFocus = true,
    closeOnOutsideClick = true,
    className,
    style,
    onKeyDown,
    ...rest
  } = props;
  const panelId = useId();
  const fallbackTriggerId = useId();
  const triggerProps = trigger.props as Record<string, unknown>;
  const triggerId = (triggerProps.id as string) || fallbackTriggerId;
  const [open, setOpen] = useControllableState(
    openProp,
    defaultOpen,
    onOpenChange
  );
  const {setReference, setFloating, reference, floating} = useFloating({
    open,
    placement,
  });
  const triggerRef = useMergedRef<Element>(
    getElementRef(trigger),
    setReference
  );

  useDismiss({
    open,
    elements: [reference, floating],
    onDismiss: () => setOpen(false),
    outsidePress: closeOnOutsideClick,
  });

  useOverlayFocus({
    open,
    reference,
    floating,
    initialFocus: (panel) => getTabbables(panel)[0] ?? panel,
  });

  return (
    <>
      {cloneTrigger(trigger, {
        ref: triggerRef,
        id: triggerId,
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': open ? panelId : undefined,
        onClick: () => setOpen(!open),
      })}
      {open && (
        <Portal>
          <div
            {...rest}
            ref={setFloating}
            id={panelId}
            role="dialog"
            aria-label={label}
            aria-labelledby={label ? undefined : triggerId}
            tabIndex={-1}
            className={cn(
              'Popover z-(--cms-z-dropdown) w-max overflow-auto rounded-md border border-border bg-surface p-3 font-sans text-base text-fg shadow-md focus:outline-none',
              className
            )}
            style={{
              ...(typeof style === 'object' ? style : {}),
              width: width !== undefined ? `${width}px` : undefined,
            }}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              if (trapFocus) {
                trapTabKey(e, e.currentTarget);
              }
            }}
          >
            {children}
          </div>
        </Portal>
      )}
    </>
  );
}
