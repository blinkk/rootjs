import type {ComponentChildren, JSX} from 'preact';
import {createContext} from 'preact';
import {useContext, useId, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';

interface TabsContextValue {
  baseId: string;
  value: string | null;
  select: (value: string) => void;
  grow: boolean;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  }
  return ctx;
}

/** Turns a tab value into something safe to use in an element id. */
function idPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export interface TabsProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'value' | 'onChange'
> {
  /** The selected tab's value, when controlled. */
  value?: string | null;
  /** The initially selected tab's value, when uncontrolled. */
  defaultValue?: string | null;
  /** Called with the new value when the user selects a tab. */
  onChange?: (value: string) => void;
  /** Stretches the tabs to share the list's full width. */
  grow?: boolean;
  className?: string;
  children?: ComponentChildren;
}

/**
 * A set of tabs and their panels. Compose it from `TabList`, `Tab` and
 * `TabPanel`; the tab list handles keyboard navigation (arrow keys, Home and
 * End move between tabs and select them) and scrolls sideways when the tabs
 * don't fit. Pass `value` + `onChange` to control it, or `defaultValue` to
 * let it manage its own state. Replaces Mantine's `Tabs`.
 *
 * ```tsx
 * <Tabs defaultValue="json">
 *   <TabList aria-label="Editor views">
 *     <Tab value="json" icon={<IconJson />}>JSON</Tab>
 *     <Tab value="diff" icon={<IconFileDiff />}>Diff</Tab>
 *   </TabList>
 *   <TabPanel value="json">…</TabPanel>
 *   <TabPanel value="diff">…</TabPanel>
 * </Tabs>
 * ```
 */
export function Tabs(props: TabsProps) {
  const {
    value: controlledValue,
    defaultValue = null,
    onChange,
    grow = false,
    className,
    children,
    ...rest
  } = props;
  const baseId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value =
    controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const select = (next: string) => {
    if (controlledValue === undefined) {
      setUncontrolledValue(next);
    }
    if (next !== value) {
      onChange?.(next);
    }
  };

  return (
    <TabsContext.Provider value={{baseId, value, select, grow}}>
      <div {...rest} className={cn('Tabs', grow && 'Tabs--grow', className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Names the set of tabs for screen readers, e.g. "Release views". */
  'aria-label'?: string;
  className?: string;
  children?: ComponentChildren;
}

/** The row of `Tab`s, with the baseline the active tab's indicator sits on. */
export function TabList(props: TabListProps) {
  const {className, children, ...rest} = props;
  const ctx = useTabsContext('TabList');

  const onKeyDown = (e: KeyboardEvent) => {
    const list = e.currentTarget as HTMLElement;
    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
    );
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1 || tabs.length === 0) {
      return;
    }
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    tabs[next].focus();
    // Tabs follow focus (automatic activation).
    ctx.select(tabs[next].dataset.value!);
  };

  return (
    <div className="Tabs__listWrapper border-0 border-b-2 border-solid border-border">
      <div
        {...rest}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={cn(
          'Tabs__list',
          '-mb-0.5 flex overflow-x-auto overflow-y-hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export interface TabProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'icon'
> {
  /** Identifies the tab and its `TabPanel`. */
  value: string;
  /** Icon before the label, e.g. `<IconJson />`. Sized by the tab. */
  icon?: ComponentChildren;
  /** A count shown in a chip after the label, e.g. the number of changes. */
  count?: number | string;
  className?: string;
  children?: ComponentChildren;
}

/** One tab. Selecting it shows the `TabPanel` with the same `value`. */
export function Tab(props: TabProps) {
  const {value, icon, count, className, children, onClick, ...rest} = props;
  const ctx = useTabsContext('Tab');
  const selected = ctx.value === value;
  const id = idPart(value);

  return (
    <button
      {...rest}
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${id}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${id}`}
      tabIndex={selected ? 0 : -1}
      data-value={value}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          ctx.select(value);
        }
      }}
      className={cn(
        'Tabs__tab',
        'relative inline-flex h-10 shrink-0 cursor-pointer appearance-none items-center justify-center gap-2 whitespace-nowrap border-0 border-b-2 border-solid border-transparent bg-transparent px-4 font-sans text-base text-muted transition-colors',
        'hover:text-fg aria-selected:border-strong aria-selected:text-strong',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:text-subtle',
        ctx.grow && 'flex-1',
        className
      )}
    >
      {icon && (
        <span
          className="Tabs__tabIcon flex shrink-0 *:size-4"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="Tabs__tabLabel">{children}</span>
      {count !== undefined && count !== null && (
        <span className="Tabs__tabCount inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-chip px-1.5 text-xs font-semibold leading-none text-fg">
          {count}
        </span>
      )}
    </button>
  );
}

export interface TabPanelProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'value'
> {
  /** The `value` of the `Tab` that shows this panel. */
  value: string;
  /**
   * Keeps the panel's content rendered (just hidden) while another tab is
   * selected, preserving its state. By default it's unmounted.
   */
  keepMounted?: boolean;
  className?: string;
  children?: ComponentChildren;
}

/** The content shown while the `Tab` with the same `value` is selected. */
export function TabPanel(props: TabPanelProps) {
  const {value, keepMounted = false, className, children, ...rest} = props;
  const ctx = useTabsContext('TabPanel');
  const selected = ctx.value === value;
  const id = idPart(value);

  return (
    <div
      {...rest}
      role="tabpanel"
      id={`${ctx.baseId}-panel-${id}`}
      aria-labelledby={`${ctx.baseId}-tab-${id}`}
      tabIndex={0}
      hidden={!selected}
      className={cn(
        'Tabs__panel',
        'pt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className
      )}
    >
      {(selected || keepMounted) && children}
    </div>
  );
}
