import type {ComponentChildren, JSX, VNode} from 'preact';
import {createContext} from 'preact';
import {useContext, useEffect, useId, useRef} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {useOverlayFocus} from '../floating/focus.js';
import {Portal} from '../floating/Portal.js';
import {cloneTrigger, getElementRef} from '../floating/trigger.js';
import {useControllableState} from '../floating/useControllableState.js';
import {useDismiss} from '../floating/useDismiss.js';
import {type Placement, useFloating} from '../floating/useFloating.js';

/** How long typed characters accumulate into one typeahead search, in ms. */
const TYPEAHEAD_TIMEOUT = 500;

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

interface MenuContextValue {
  /** Closes the menu; focus returns to the trigger. */
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export interface MenuProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'label' | 'width'
> {
  /**
   * The button that opens the menu: a single element that forwards its ref
   * and props, e.g. a `Button` or `IconButton` (optionally inside a
   * `Tooltip`). It gets `aria-haspopup`, `aria-expanded` and
   * `aria-controls`, and opens the menu on click, Enter, Space, ArrowDown
   * (focusing the first item) or ArrowUp (the last).
   */
  trigger: VNode<any>;
  /** `MenuItem`s, `MenuGroup`s and `MenuDivider`s. */
  children: ComponentChildren;
  /** Preferred side and alignment; it flips when there isn't room. Default `bottom-start`. */
  placement?: Placement;
  /** Controls visibility. Leave unset for an uncontrolled menu. */
  open?: boolean;
  /** Initial visibility when uncontrolled. */
  defaultOpen?: boolean;
  /** Called when the menu wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Width in px. Default: sized to the items, at least 192px. It never
   * exceeds the screen.
   */
  width?: number;
  /** The menu's accessible name. Defaults to the trigger's name. */
  label?: string;
  /** Classes for the menu panel. */
  className?: string;
}

/**
 * A menu of actions or links behind a trigger button, with full menu
 * keyboard support: arrow keys move between items (wrapping), Home/End jump
 * to the ends, typing jumps to the next item starting with those letters,
 * Enter/Space choose, Escape closes, and Tab closes and moves on. Choosing
 * an item closes the menu and returns focus to the trigger. Replaces
 * Mantine's `Menu`.
 *
 * ```tsx
 * <Menu
 *   placement="bottom-end"
 *   trigger={<IconButton label="More actions"><IconDotsVertical /></IconButton>}
 * >
 *   <MenuItem icon={<IconCopy />} hint="⌘D" onClick={duplicate}>Duplicate</MenuItem>
 *   <MenuItem icon={<IconExternalLink />} href={previewUrl} target="_blank">
 *     Open preview
 *   </MenuItem>
 *   <MenuDivider />
 *   <MenuItem icon={<IconTrash />} danger onClick={remove}>Delete</MenuItem>
 * </Menu>
 * ```
 */
export function Menu(props: MenuProps) {
  const {
    trigger,
    children,
    placement = 'bottom-start',
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    width,
    label,
    className,
    style,
    onKeyDown,
    ...rest
  } = props;
  const menuId = useId();
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
  // Which item to focus when the menu opens.
  const initialItemRef = useRef<'first' | 'last'>('first');
  const typeaheadRef = useRef({query: '', timer: 0});

  useEffect(() => () => window.clearTimeout(typeaheadRef.current.timer), []);

  useDismiss({
    open,
    elements: [reference, floating],
    onDismiss: () => setOpen(false),
  });

  useOverlayFocus({
    open,
    reference,
    floating,
    initialFocus: (menu) => {
      const items = getItems(menu);
      const item =
        initialItemRef.current === 'last' ? items[items.length - 1] : items[0];
      initialItemRef.current = 'first';
      return item ?? menu;
    },
  });

  function openMenu(initialItem: 'first' | 'last') {
    initialItemRef.current = initialItem;
    setOpen(true);
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  }

  function onMenuKeyDown(e: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    const menu = e.currentTarget;
    const items = getItems(menu);
    const active = document.activeElement as HTMLElement | null;
    const index = active ? items.indexOf(active) : -1;
    // Leave text editing keys alone in a field inside the menu (e.g. a
    // filter input); only the arrow keys move into the items.
    const inTextField = !!active?.matches('input, textarea, [contenteditable]');
    const focusItem = (i: number) => {
      items[(i + items.length) % items.length]?.focus();
    };

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(index + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(index === -1 ? -1 : index - 1);
        return;
      case 'Home':
      case 'End':
        if (inTextField) {
          return;
        }
        e.preventDefault();
        focusItem(e.key === 'Home' ? 0 : -1);
        return;
      case 'Tab':
        // Focus the trigger without preventing the default, so the browser
        // moves focus on from the trigger, in page order.
        setOpen(false);
        if (reference instanceof HTMLElement) {
          reference.focus();
        }
        return;
      case ' ':
        // Buttons click on Space natively; links don't.
        if (!inTextField && active instanceof HTMLAnchorElement) {
          e.preventDefault();
          active.click();
        }
        return;
    }

    if (
      inTextField ||
      e.key.length !== 1 ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    ) {
      return;
    }
    // Typeahead: jump to the next item whose label starts with the typed
    // characters.
    const typeahead = typeaheadRef.current;
    window.clearTimeout(typeahead.timer);
    typeahead.query += e.key.toLowerCase();
    typeahead.timer = window.setTimeout(() => {
      typeahead.query = '';
    }, TYPEAHEAD_TIMEOUT);
    // Typing one letter (or the same letter repeatedly) cycles through the
    // items starting with it; longer queries refine from the current item.
    const query = /^(.)\1*$/.test(typeahead.query)
      ? typeahead.query[0]
      : typeahead.query;
    const start = query.length === 1 ? index + 1 : Math.max(index, 0);
    for (let i = 0; i < items.length; i++) {
      const item = items[(start + i) % items.length];
      if (getItemText(item).startsWith(query)) {
        item.focus();
        return;
      }
    }
  }

  return (
    <MenuContext.Provider value={{close: () => setOpen(false)}}>
      {cloneTrigger(trigger, {
        ref: triggerRef,
        id: triggerId,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => (open ? setOpen(false) : openMenu('first')),
        onKeyDown: onTriggerKeyDown,
      })}
      {open && (
        <Portal>
          <div
            {...rest}
            ref={setFloating}
            id={menuId}
            role="menu"
            aria-label={label}
            aria-labelledby={label ? undefined : triggerId}
            tabIndex={-1}
            className={cn(
              'Menu z-(--cms-z-dropdown) w-max min-w-48 overflow-y-auto rounded-md border border-border bg-surface p-1 font-sans text-sm text-fg shadow-md focus:outline-none',
              className
            )}
            style={{
              ...(typeof style === 'object' ? style : {}),
              width: width !== undefined ? `${width}px` : undefined,
            }}
            onKeyDown={onMenuKeyDown}
          >
            {children}
          </div>
        </Portal>
      )}
    </MenuContext.Provider>
  );
}

function getItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

function getItemText(item: HTMLElement): string {
  const label = item.querySelector('.Menu__itemLabel') ?? item;
  return (label.textContent ?? '').trim().toLowerCase();
}

interface MenuItemOwnProps {
  /** The item's label. */
  children: ComponentChildren;
  /** Icon before the label, e.g. `<IconCopy />`. Sized by the item. */
  icon?: ComponentChildren;
  /**
   * Content at the right edge: a keyboard shortcut (`⌘D`), a count, or a
   * check mark for the current choice.
   */
  hint?: ComponentChildren;
  /** Styles a destructive action in red. */
  danger?: boolean;
  /** Shows the item but makes it unselectable; arrow keys skip it. */
  disabled?: boolean;
  /**
   * Close the menu after the item is chosen. Set `false` for toggles that
   * keep the menu open. Default `true`.
   */
  closeOnClick?: boolean;
  className?: string;
}

type MenuItemAsButton = MenuItemOwnProps &
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, keyof MenuItemOwnProps> & {
    href?: undefined;
  };

type MenuItemAsLink = MenuItemOwnProps &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, keyof MenuItemOwnProps> & {
    /** Renders the item as a link. */
    href: string;
  };

export type MenuItemProps = MenuItemAsButton | MenuItemAsLink;

/**
 * One action in a `Menu`, or a link when `href` is set.
 *
 * ```tsx
 * <MenuItem icon={<IconTrash />} danger onClick={remove}>Delete</MenuItem>
 * ```
 */
export function MenuItem(props: MenuItemProps) {
  const {
    children,
    icon,
    hint,
    danger = false,
    disabled = false,
    closeOnClick = true,
    className,
    onClick,
    ...rest
  } = props;
  const menu = useContext(MenuContext);

  const classes = cn(
    'Menu__item',
    danger && 'Menu__item--danger',
    'flex w-full cursor-pointer select-none appearance-none items-center gap-2 rounded-sm border-0 bg-transparent px-3 py-2 text-left font-sans text-sm leading-snug no-underline focus:outline-none',
    'pointer-coarse:min-h-10',
    danger
      ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
      : 'text-fg hover:bg-surface-hover focus-visible:bg-surface-hover',
    'aria-disabled:cursor-default aria-disabled:bg-transparent aria-disabled:text-subtle',
    className
  );

  const content = (
    <>
      {icon && (
        <span
          className="Menu__itemIcon flex shrink-0 *:size-4"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="Menu__itemLabel min-w-0 flex-1">{children}</span>
      {hint && (
        <span className="Menu__itemHint ml-4 flex shrink-0 items-center text-xs text-muted *:size-3.5">
          {hint}
        </span>
      )}
    </>
  );

  const handleClick = (e: MouseEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    (onClick as ((e: MouseEvent) => void) | undefined)?.(e);
    if (closeOnClick && !e.defaultPrevented) {
      menu?.close();
    }
  };

  // Hovering an item focuses it, so the pointer and the keyboard share one
  // highlighted item.
  const handlePointerMove = (e: PointerEvent) => {
    const item = e.currentTarget as HTMLElement;
    if (!disabled && document.activeElement !== item) {
      item.focus({preventScroll: true});
    }
  };

  if (rest.href !== undefined) {
    const {href, ...anchorProps} = rest as MenuItemAsLink;
    return (
      <a
        {...anchorProps}
        href={disabled ? undefined : href}
        role="menuitem"
        tabIndex={-1}
        aria-disabled={disabled || undefined}
        className={classes}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
      >
        {content}
      </a>
    );
  }

  const {type = 'button', ...buttonProps} = rest as MenuItemAsButton;
  return (
    <button
      {...buttonProps}
      type={type}
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={classes}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
    >
      {content}
    </button>
  );
}

export interface MenuGroupProps {
  /** The group's heading, e.g. "Insert". */
  label: ComponentChildren;
  /** The group's `MenuItem`s. */
  children: ComponentChildren;
  className?: string;
}

/** A labeled group of items in a `Menu`. */
export function MenuGroup(props: MenuGroupProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn('Menu__group', props.className)}
    >
      <div
        id={labelId}
        className="Menu__groupLabel cursor-default px-3 pb-1 pt-2 text-xs font-medium text-muted"
      >
        {props.label}
      </div>
      {props.children}
    </div>
  );
}

/** A line between groups of items in a `Menu`. */
export function MenuDivider(props: {className?: string}) {
  return (
    <div
      role="separator"
      className={cn('Menu__divider -mx-1 my-1 h-px bg-border', props.className)}
    />
  );
}
