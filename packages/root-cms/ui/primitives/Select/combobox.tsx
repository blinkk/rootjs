import {IconCheck} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {Portal} from '../floating/Portal.js';
import {useDismiss} from '../floating/useDismiss.js';
import {useFloating} from '../floating/useFloating.js';

/**
 * Shared logic for `Select` and `MultiSelect`: option data, filtering,
 * grouping, the open state and active option, keyboard navigation, and the
 * dropdown listbox. Not exported from the primitives for feature code; use
 * `Select` or `MultiSelect`.
 */

/** How long typed characters accumulate into one typeahead search, in ms. */
const TYPEAHEAD_TIMEOUT = 500;

/** One choice in a `Select` or `MultiSelect`. */
export interface SelectOption {
  /** The value reported by `onValueChange`. */
  value: string;
  /** The text shown for the option. Defaults to `value`. */
  label?: string;
  /** A second line of help text under the label. */
  description?: string;
  /** Shows the option but makes it unselectable; arrow keys skip it. */
  disabled?: boolean;
  /** Options with the same `group` are shown together under this heading. */
  group?: string;
}

/**
 * The `data` prop: plain strings (each is both value and label) or option
 * objects. Option objects may carry extra fields for `renderOption`.
 */
export type SelectData<T extends SelectOption = SelectOption> = Array<
  string | T
>;

/** An option with its label resolved. */
export type ResolvedOption<T extends SelectOption = SelectOption> = T & {
  label: string;
};

/** State passed to `renderOption`. */
export interface RenderOptionState {
  /** Whether the option is the current value (or one of them). */
  selected: boolean;
  /** Whether the option is highlighted by the keyboard or pointer. */
  active: boolean;
}

/** An entry in the dropdown: an option, or the "create" entry. */
export type ComboboxItem<T extends SelectOption = SelectOption> =
  {kind: 'option'; option: ResolvedOption<T>} | {kind: 'create'; query: string};

/** Normalizes `data` into option objects with labels. */
export function resolveOptions<T extends SelectOption>(
  data: SelectData<T>
): ResolvedOption<T>[] {
  return data.map((item) =>
    typeof item === 'string'
      ? ({value: item, label: item} as ResolvedOption<T>)
      : ({...item, label: item.label ?? item.value} as ResolvedOption<T>)
  );
}

/** The default filter: the label contains the query, ignoring case. */
export function defaultFilter(query: string, option: ResolvedOption<any>) {
  return option.label.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * The default `shouldCreate`: offer to create the query unless an option's
 * value or label already matches it, ignoring case.
 */
export function defaultShouldCreate(
  query: string,
  options: ResolvedOption<any>[]
) {
  const q = query.trim().toLowerCase();
  return (
    q.length > 0 &&
    !options.some(
      (option) =>
        option.value.toLowerCase() === q || option.label.toLowerCase() === q
    )
  );
}

export interface GetItemsOptions<T extends SelectOption> {
  options: ResolvedOption<T>[];
  /** The search text, or `null` when the user isn't searching. */
  query: string | null;
  filter?: (query: string, option: ResolvedOption<T>) => boolean;
  /** Max options shown after filtering. */
  limit?: number;
  /** Values to leave out (MultiSelect's selected values). */
  exclude?: string[];
  creatable?: boolean;
  shouldCreate?: (query: string, options: ResolvedOption<T>[]) => boolean;
}

/**
 * Filters, limits and groups the options into the dropdown's entries, in
 * display order: ungrouped options first, then each group in the order it
 * first appears, then the "create" entry when it applies.
 */
export function getComboboxItems<T extends SelectOption>(
  opts: GetItemsOptions<T>
): ComboboxItem<T>[] {
  const {options, query, filter = defaultFilter, limit, exclude} = opts;
  let matches = options.filter(
    (option) => !exclude || !exclude.includes(option.value)
  );
  if (query) {
    matches = matches.filter((option) => filter(query, option));
  }
  if (limit !== undefined) {
    matches = matches.slice(0, limit);
  }

  const ungrouped: ResolvedOption<T>[] = [];
  // Groups keep the order they first appear in among all options, so
  // filtering doesn't reorder them.
  const groups = new Map<string, ResolvedOption<T>[]>();
  for (const option of options) {
    if (option.group && !groups.has(option.group)) {
      groups.set(option.group, []);
    }
  }
  for (const option of matches) {
    if (!option.group) {
      ungrouped.push(option);
      continue;
    }
    groups.get(option.group)!.push(option);
  }
  const items: ComboboxItem<T>[] = [
    ...ungrouped,
    ...[...groups.values()].flat(),
  ].map((option) => ({kind: 'option', option}));

  const shouldCreate = opts.shouldCreate ?? defaultShouldCreate;
  if (opts.creatable && query && query.trim() && shouldCreate(query, options)) {
    items.push({kind: 'create', query: query.trim()});
  }
  return items;
}

function isEnabled(item: ComboboxItem<any> | undefined) {
  return !!item && !(item.kind === 'option' && item.option.disabled);
}

/**
 * The index of the next enabled item from `from` in `direction`, wrapping
 * around, or -1 when none is enabled.
 */
export function nextEnabledIndex(
  items: ComboboxItem<any>[],
  from: number,
  direction: 1 | -1
): number {
  const count = items.length;
  for (let step = 1; step <= count; step++) {
    const i = (((from + step * direction) % count) + count) % count;
    if (isEnabled(items[i])) {
      return i;
    }
  }
  return -1;
}

function itemText(item: ComboboxItem<any>) {
  return item.kind === 'option' ? item.option.label.toLowerCase() : '';
}

/**
 * Why the dropdown closed: an entry was chosen, Escape, a press outside,
 * focus left the control (or Tab), or the control was toggled.
 */
export type CloseReason = 'choose' | 'escape' | 'outside' | 'blur' | 'toggle';

export interface UseComboboxOptions<T extends SelectOption> {
  items: ComboboxItem<T>[];
  disabled?: boolean;
  defaultOpen?: boolean;
  /** Whether the dropdown shows when there are no entries. */
  hasEmptyState: boolean;
  /** Called when an entry is chosen with Enter, Space or a click. */
  onChoose: (item: ComboboxItem<T>) => void;
  /** The entry to highlight on open, usually the selected option. */
  getInitialIndex: (items: ComboboxItem<T>[]) => number;
  /** Called after the dropdown closes, with why. */
  onClose?: (reason: CloseReason) => void;
}

/**
 * Open state, the active (highlighted) entry, positioning and dismissal for
 * a combobox. Focus stays on the control the whole time; the active entry is
 * conveyed with `aria-activedescendant`.
 */
export function useCombobox<T extends SelectOption>(
  opts: UseComboboxOptions<T>
) {
  const {items} = opts;
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [open, setOpen] = useState(!!opts.defaultOpen && !opts.disabled);
  const [activeIndex, setActiveIndex] = useState(() =>
    opts.defaultOpen ? opts.getInitialIndex(items) : -1
  );
  const typeaheadRef = useRef({query: '', timer: 0});
  const onCloseRef = useRef(opts.onClose);
  onCloseRef.current = opts.onClose;

  const shown = open && (items.length > 0 || opts.hasEmptyState);
  const {setReference, setFloating, reference, floating} = useFloating({
    open: shown,
    placement: 'bottom-start',
    matchReferenceWidth: 'equal',
  });

  // The active entry, if it's still there and enabled.
  const active = isEnabled(items[activeIndex]) ? activeIndex : -1;

  function optionId(index: number) {
    return `${baseId}-option-${index}`;
  }

  function openList(highlight: 'initial' | 'first' | 'last' = 'initial') {
    if (opts.disabled) {
      return;
    }
    setOpen(true);
    if (highlight === 'first') {
      setActiveIndex(nextEnabledIndex(items, -1, 1));
    } else if (highlight === 'last') {
      setActiveIndex(nextEnabledIndex(items, items.length, -1));
    } else {
      setActiveIndex(opts.getInitialIndex(items));
    }
  }

  function close(reason: CloseReason = 'toggle') {
    if (!open) {
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
    onCloseRef.current?.(reason);
  }

  function move(direction: 1 | -1) {
    setActiveIndex(
      nextEnabledIndex(
        items,
        active === -1 && direction === -1 ? items.length : active,
        direction
      )
    );
  }

  function choose(index: number) {
    const item = items[index];
    if (isEnabled(item)) {
      opts.onChoose(item);
    }
  }

  /**
   * Typeahead: highlights the next option whose label starts with the typed
   * characters, opening the dropdown if needed. Returns whether it handled
   * the key.
   */
  function typeahead(e: KeyboardEvent): boolean {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
      return false;
    }
    const state = typeaheadRef.current;
    if (e.key === ' ' && !state.query) {
      return false;
    }
    window.clearTimeout(state.timer);
    state.query += e.key.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.query = '';
    }, TYPEAHEAD_TIMEOUT);
    // One letter (or the same letter repeated) cycles through the options
    // starting with it; longer queries refine from the current option.
    const query = /^(.)\1*$/.test(state.query) ? state.query[0] : state.query;
    const current = open ? active : opts.getInitialIndex(items);
    const start = query.length === 1 ? current + 1 : Math.max(current, 0);
    for (let i = 0; i < items.length; i++) {
      const index = (start + i) % items.length;
      if (isEnabled(items[index]) && itemText(items[index]).startsWith(query)) {
        setOpen(true);
        setActiveIndex(index);
        break;
      }
    }
    return true;
  }

  /** Whether a typeahead search is in progress (Space then types a space). */
  function isTypingAhead() {
    return typeaheadRef.current.query.length > 0;
  }

  useEffect(() => () => window.clearTimeout(typeaheadRef.current.timer), []);

  // Close if the control becomes disabled while open.
  useEffect(() => {
    if (opts.disabled) {
      close('blur');
    }
  }, [opts.disabled]);

  // Keep the active option in view while navigating.
  useLayoutEffect(() => {
    if (!shown || active === -1 || !floating) {
      return;
    }
    const el = floating.querySelector(`[id="${optionId(active)}"]`);
    (el as HTMLElement | null)?.scrollIntoView?.({block: 'nearest'});
  }, [shown, active, floating]);

  useDismiss({
    open: shown,
    elements: [reference, floating],
    onDismiss: (reason) => close(reason),
  });

  return {
    open,
    shown,
    active,
    setActiveIndex,
    listboxId,
    optionId,
    openList,
    close,
    move,
    choose,
    typeahead,
    isTypingAhead,
    setReference,
    setFloating,
    floating,
  };
}

/** What `useCombobox` returns. */
export type Combobox<T extends SelectOption = SelectOption> = ReturnType<
  typeof useCombobox<T>
>;

export interface ComboboxDropdownProps<T extends SelectOption> {
  /** The BEM block, `Select` or `MultiSelect`. */
  block: string;
  combobox: Combobox<T>;
  items: ComboboxItem<T>[];
  isSelected: (value: string) => boolean;
  multiple?: boolean;
  /** Labels the listbox: the field label's id. */
  labelledBy?: string;
  /** Labels the listbox when there's no visible label. */
  label?: string;
  nothingFound?: ComponentChildren;
  maxDropdownHeight: number;
  getCreateLabel: (query: string) => ComponentChildren;
  renderOption?: (
    option: ResolvedOption<T>,
    state: RenderOptionState
  ) => ComponentChildren;
  className?: string;
}

/** The dropdown: a portaled, positioned `listbox` of the entries. */
export function ComboboxDropdown<T extends SelectOption>(
  props: ComboboxDropdownProps<T>
) {
  const {block, combobox, items} = props;
  const groupIdBase = useId();
  if (!combobox.shown) {
    return null;
  }

  const renderItem = (item: ComboboxItem<T>, index: number) => {
    const active = index === combobox.active;
    if (item.kind === 'create') {
      return (
        <div
          key="__create"
          id={combobox.optionId(index)}
          role="option"
          aria-selected="false"
          data-active={active || undefined}
          className={cn(OPTION_CLASSES, `${block}__option`, `${block}__create`)}
          onPointerMove={() => combobox.setActiveIndex(index)}
          onClick={() => combobox.choose(index)}
        >
          <span className={`${block}__optionLabel min-w-0 flex-1`}>
            {props.getCreateLabel(item.query)}
          </span>
        </div>
      );
    }
    const {option} = item;
    const selected = props.isSelected(option.value);
    return (
      <div
        key={option.value}
        id={combobox.optionId(index)}
        role="option"
        aria-selected={selected ? 'true' : 'false'}
        aria-disabled={option.disabled || undefined}
        data-active={active || undefined}
        className={cn(OPTION_CLASSES, `${block}__option`)}
        onPointerMove={() => {
          if (!option.disabled) {
            combobox.setActiveIndex(index);
          }
        }}
        onClick={() => combobox.choose(index)}
      >
        {props.renderOption ? (
          <span className={`${block}__optionContent min-w-0 flex-1`}>
            {props.renderOption(option, {selected, active})}
          </span>
        ) : (
          <span className={`${block}__optionContent min-w-0 flex-1`}>
            <span className={`${block}__optionLabel block break-words`}>
              {option.label}
            </span>
            {option.description && (
              <span
                className={`${block}__optionDescription mt-0.5 block text-xs text-muted`}
              >
                {option.description}
              </span>
            )}
          </span>
        )}
        {selected && (
          <span
            className={`${block}__optionCheck flex shrink-0 text-fg *:size-3.5`}
            aria-hidden="true"
          >
            <IconCheck />
          </span>
        )}
      </div>
    );
  };

  // Render runs of options in the same group inside a labeled `group`.
  const children: ComponentChildren[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const group = item.kind === 'option' ? item.option.group : undefined;
    if (!group) {
      children.push(renderItem(item, i));
      i++;
      continue;
    }
    const start = i;
    const run: ComponentChildren[] = [];
    while (
      i < items.length &&
      items[i].kind === 'option' &&
      (items[i] as {option: ResolvedOption<T>}).option.group === group
    ) {
      run.push(renderItem(items[i], i));
      i++;
    }
    const groupLabelId = `${groupIdBase}-group-${start}`;
    children.push(
      <div
        key={`__group-${group}`}
        role="group"
        aria-labelledby={groupLabelId}
        className={`${block}__group`}
      >
        <div
          id={groupLabelId}
          role="presentation"
          className={`${block}__groupLabel cursor-default px-3 pb-1 pt-2 text-xs font-medium text-muted`}
        >
          {group}
        </div>
        {run}
      </div>
    );
  }

  return (
    <Portal>
      <div
        ref={combobox.setFloating}
        className={cn(
          `${block}__dropdown`,
          'z-(--cms-z-dropdown) flex flex-col overflow-hidden rounded-md border border-border bg-surface p-1 font-sans text-sm text-fg shadow-md',
          props.className
        )}
        // Keep focus on the control when the dropdown is pressed.
        onMouseDown={(e) => e.preventDefault()}
      >
        <div
          id={combobox.listboxId}
          role="listbox"
          aria-labelledby={props.labelledBy}
          aria-label={props.labelledBy ? undefined : props.label}
          aria-multiselectable={props.multiple || undefined}
          className={`${block}__listbox min-h-0 flex-1 overflow-y-auto overscroll-contain`}
          style={{maxHeight: `${props.maxDropdownHeight}px`}}
        >
          {children}
        </div>
        {items.length === 0 && (
          <div className={`${block}__empty px-3 py-2 text-muted`}>
            {props.nothingFound}
          </div>
        )}
      </div>
    </Portal>
  );
}

const OPTION_CLASSES =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 leading-snug text-fg pointer-coarse:min-h-10 ' +
  'data-active:bg-surface-hover ' +
  'aria-disabled:cursor-default aria-disabled:bg-transparent aria-disabled:text-subtle';
