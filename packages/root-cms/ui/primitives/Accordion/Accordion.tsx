import {IconChevronDown, IconChevronRight} from '@tabler/icons-preact';
import type {ComponentChildren, JSX} from 'preact';
import {createContext} from 'preact';
import {
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import {cn} from '../../utils/classes.js';

interface AccordionContextValue {
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
  chevronPosition: 'left' | 'right';
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

export interface AccordionProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'value' | 'onChange'
> {
  /**
   * Lets several items be open at once. By default opening one item closes
   * the others.
   */
  multiple?: boolean;
  /** Values of the open items, when controlled. */
  value?: string[];
  /** Values of the initially open items, when uncontrolled. */
  defaultValue?: string[];
  /** Called with the values of the open items after one is toggled. */
  onChange?: (value: string[]) => void;
  /**
   * Which side of the label the chevron sits on: `right` (default) or
   * `left` (tree-like lists, e.g. collection folders).
   */
  chevronPosition?: 'left' | 'right';
  className?: string;
  children?: ComponentChildren;
}

/**
 * A stack of collapsible sections, built from `AccordionItem`s. Each item's
 * header is a button (with `aria-expanded`) that shows or hides its region.
 * Pass `value` + `onChange` to control which items are open, or
 * `defaultValue` to let it manage its own state. Replaces Mantine's
 * `Accordion`.
 *
 * ```tsx
 * <Accordion multiple defaultValue={['editors']}>
 *   <AccordionItem value="editors" label="Editors">…</AccordionItem>
 *   <AccordionItem value="viewers" label="Viewers">…</AccordionItem>
 * </Accordion>
 * ```
 */
export function Accordion(props: AccordionProps) {
  const {
    multiple = false,
    value: controlledValue,
    defaultValue = [],
    onChange,
    chevronPosition = 'right',
    className,
    children,
    ...rest
  } = props;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const open = controlledValue ?? uncontrolledValue;

  const toggle = (item: string) => {
    let next: string[];
    if (open.includes(item)) {
      next = open.filter((v) => v !== item);
    } else {
      next = multiple ? [...open, item] : [item];
    }
    if (controlledValue === undefined) {
      setUncontrolledValue(next);
    }
    onChange?.(next);
  };

  return (
    <AccordionContext.Provider
      value={{isOpen: (v) => open.includes(v), toggle, chevronPosition}}
    >
      <div
        {...rest}
        className={cn(
          'Accordion',
          `Accordion--chevron-${chevronPosition}`,
          className
        )}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'value' | 'label'
> {
  /** Identifies the item in the accordion's `value`. */
  value: string;
  /**
   * The header's content: text, or richer markup (no buttons or links; use
   * `href` to make the label a link).
   */
  label: ComponentChildren;
  /**
   * Makes the label a link to this URL, e.g. a folder's own page. The
   * chevron becomes a separate toggle button next to it (named by the
   * label), so the header stays valid HTML: no link inside a button.
   */
  href?: string;
  /**
   * Extra props for the label's link (with `href`), e.g. `aria-current` or
   * `target`.
   */
  linkProps?: Omit<JSX.HTMLAttributes<HTMLAnchorElement>, 'href'>;
  /**
   * Keeps the content rendered (just hidden) while the item is closed,
   * preserving its state. By default it's unmounted.
   */
  keepMounted?: boolean;
  /** Prevents the item from being toggled. */
  disabled?: boolean;
  className?: string;
  children?: ComponentChildren;
}

/**
 * One collapsible section of an `Accordion`. With `href`, the label is a
 * link and the chevron toggles the section on its own.
 *
 * ```tsx
 * <AccordionItem value="blog" label="Blog" href="/cms/content/blog">
 *   …
 * </AccordionItem>
 * ```
 */
export function AccordionItem(props: AccordionItemProps) {
  const {
    value,
    label,
    href,
    linkProps,
    keepMounted = false,
    disabled = false,
    className,
    children,
    ...rest
  } = props;
  const ctx = useContext(AccordionContext);
  if (!ctx) {
    throw new Error('<AccordionItem> must be rendered inside <Accordion>.');
  }
  const id = useId();
  const open = ctx.isOpen(value);
  const panelRef = useRef<HTMLDivElement>(null);
  const visible = useCollapse(panelRef, open);
  const chevronLeft = ctx.chevronPosition === 'left';
  const Chevron = chevronLeft ? IconChevronRight : IconChevronDown;
  // Tree-style (left) chevrons point right, and down when open.
  const chevron = (
    <Chevron
      className={cn(
        'Accordion__chevron size-4 shrink-0 text-muted transition-transform',
        open && (chevronLeft ? 'rotate-90' : 'rotate-180')
      )}
      aria-hidden="true"
    />
  );

  // The separate toggle, when the label is a link.
  const toggle = href !== undefined && (
    <button
      type="button"
      id={`${id}-control`}
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      aria-labelledby={`${id}-label`}
      disabled={disabled}
      onClick={() => ctx.toggle(value)}
      className={cn(
        'Accordion__control',
        'mx-1 flex size-control-sm shrink-0 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 transition-colors',
        'hover:bg-surface-active focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-10'
      )}
    >
      {chevron}
    </button>
  );

  return (
    <div
      {...rest}
      className={cn(
        'Accordion__item',
        'border-0 border-b border-solid border-border',
        className
      )}
    >
      {href === undefined ? (
        <button
          type="button"
          id={`${id}-control`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          disabled={disabled}
          onClick={() => ctx.toggle(value)}
          className={cn(
            'Accordion__control',
            'flex w-full cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent px-2 py-3 text-left font-sans text-base font-medium text-strong transition-colors',
            'hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
            'disabled:cursor-not-allowed disabled:opacity-50',
            chevronLeft && 'flex-row-reverse'
          )}
        >
          <span className="Accordion__label min-w-0 flex-1 truncate">
            {label}
          </span>
          {chevron}
        </button>
      ) : (
        // A link and a toggle side by side, in visual order. The toggle is
        // named by the link.
        <div className="Accordion__header flex items-center transition-colors hover:bg-surface-hover">
          {chevronLeft && toggle}
          <a
            {...linkProps}
            id={`${id}-label`}
            href={href}
            className={cn(
              'Accordion__link',
              'min-w-0 flex-1 truncate py-3 font-sans text-base font-medium text-strong no-underline',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
              chevronLeft ? 'pr-2' : 'px-2',
              linkProps?.className as string | undefined
            )}
          >
            {label}
          </a>
          {!chevronLeft && toggle}
        </div>
      )}
      <div
        ref={panelRef}
        role="region"
        id={`${id}-panel`}
        aria-labelledby={`${id}-control`}
        hidden={!visible}
        className="Accordion__panel overflow-hidden"
      >
        <div className="Accordion__content px-2 pb-3 text-sm">
          {(visible || keepMounted) && children}
        </div>
      </div>
    </div>
  );
}

/**
 * Animates a panel's height as it opens and closes, keeping it visible until
 * the closing animation ends. Returns whether the panel should be shown.
 * Toggles instantly when reduced motion is preferred.
 */
function useCollapse(ref: {current: HTMLElement | null}, open: boolean) {
  const [shown, setShown] = useState(open);
  const animation = useRef<Animation | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || typeof el.animate !== 'function' || reduceMotion) {
      setShown(open);
      return;
    }
    // Starts from the current height, so toggling mid-animation reverses
    // smoothly.
    const from = animation.current ? el.getBoundingClientRect().height : null;
    animation.current?.cancel();
    if (open) {
      setShown(true);
    }
    const full = el.scrollHeight;
    const anim = el.animate(
      {
        height: open
          ? [`${from ?? 0}px`, `${full}px`]
          : [`${from ?? full}px`, '0px'],
      },
      {duration: 200, easing: 'ease-out'}
    );
    animation.current = anim;
    anim.onfinish = () => {
      animation.current = null;
      if (!open) {
        setShown(false);
      }
    };
  }, [open]);

  return open || shown;
}
