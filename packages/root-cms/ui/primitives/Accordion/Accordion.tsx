import {IconChevronDown, IconChevronRight} from '@tabler/icons-preact';
import type {ComponentChildren, JSX} from 'preact';
import {createContext} from 'preact';
import {useContext, useId, useState} from 'preact/hooks';
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
  /** The header's content: text, or richer markup (no buttons or links). */
  label: ComponentChildren;
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

/** One collapsible section of an `Accordion`. */
export function AccordionItem(props: AccordionItemProps) {
  const {
    value,
    label,
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
  const chevronLeft = ctx.chevronPosition === 'left';
  const Chevron = chevronLeft ? IconChevronRight : IconChevronDown;

  return (
    <div
      {...rest}
      className={cn(
        'Accordion__item',
        'border-0 border-b border-solid border-border',
        className
      )}
    >
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
        {/* Tree-style (left) chevrons point right, and down when open. */}
        <Chevron
          className={cn(
            'Accordion__chevron size-4 shrink-0 text-muted transition-transform',
            open && (chevronLeft ? 'rotate-90' : 'rotate-180')
          )}
          aria-hidden="true"
        />
      </button>
      <div
        role="region"
        id={`${id}-panel`}
        aria-labelledby={`${id}-control`}
        hidden={!open}
        className="Accordion__panel px-2 pb-3 text-sm"
      >
        {(open || keepMounted) && children}
      </div>
    </div>
  );
}
