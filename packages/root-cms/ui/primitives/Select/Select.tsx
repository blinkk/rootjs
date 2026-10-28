import {IconSelector, IconX} from '@tabler/icons-preact';
import type {ComponentChildren, JSX, Ref, VNode} from 'preact';
import {forwardRef} from 'preact/compat';
import {useLayoutEffect, useMemo, useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {
  Field,
  fieldControlProps,
  fieldLabelId,
  needsField,
  useFieldId,
} from '../Field/Field.js';
import {useControllableState} from '../floating/useControllableState.js';
import {
  INPUT_BASE_CLASSES,
  INPUT_LEFT_PADDING_CLASSES,
  INPUT_RIGHT_PADDING_CLASSES,
  INPUT_RIGHT_SECTION_CLASSES,
  INPUT_SECTION_CLASSES,
  INPUT_SIZE_CLASSES,
  type InputChromeProps,
} from '../TextInput/TextInput.js';
import {
  ComboboxDropdown,
  type ComboboxItem,
  getComboboxItems,
  nextEnabledIndex,
  type RenderOptionState,
  type ResolvedOption,
  resolveOptions,
  type SelectData,
  type SelectOption,
  useCombobox,
} from './combobox.js';

export type {
  RenderOptionState,
  ResolvedOption,
  SelectData,
  SelectOption,
} from './combobox.js';

/** Classes for the clear button in the right section. */
export const SELECT_CLEAR_CLASSES =
  'm-0 flex size-5 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-focus *:size-3.5 pointer-coarse:size-8';

/** Props shared by `Select` and `MultiSelect`. */
export interface ComboboxSharedProps<
  T extends SelectOption = SelectOption,
> extends Omit<InputChromeProps, 'inputClassName'> {
  /** The options: strings, or `SelectOption` objects (with `group` to group them). */
  data: SelectData<T>;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Disables the control. */
  disabled?: boolean;
  /** Adds a clear button when a value is set. */
  clearable?: boolean;
  /** Accessible name of the clear button. Default "Clear". */
  clearLabel?: string;
  /**
   * Offers to add the search text as a new option, at the end of the
   * dropdown. Choosing it calls `onCreate` and selects the result.
   */
  creatable?: boolean;
  /** The create entry's label. Default `+ Create "query"`. */
  getCreateLabel?: (query: string) => ComponentChildren;
  /**
   * Called when the create entry is chosen. Return the new option (or its
   * value) to select; add it to `data` yourself. Returning nothing selects
   * the query as typed.
   */
  onCreate?: (query: string) => T | string | null | undefined | void;
  /**
   * Whether to offer the create entry for a query. Default: when no option's
   * value or label equals it, ignoring case.
   */
  shouldCreate?: (query: string, options: ResolvedOption<T>[]) => boolean;
  /**
   * Whether an option matches the search text. Default: its label contains
   * the text, ignoring case.
   */
  filter?: (query: string, option: ResolvedOption<T>) => boolean;
  /** Max options shown after filtering. Default: all. */
  limit?: number;
  /**
   * Shown in the dropdown when no option matches. When unset, the dropdown
   * stays closed instead.
   */
  nothingFound?: ComponentChildren;
  /**
   * Renders an option's content in the dropdown, e.g. an avatar and an
   * email. The option's row, highlight and check mark stay the same. By
   * default it shows the label and `description`.
   */
  renderOption?: (
    option: ResolvedOption<T>,
    state: RenderOptionState
  ) => ComponentChildren;
  /** Max height of the dropdown before it scrolls, in px. Default 280. */
  maxDropdownHeight?: number;
  /** Opens the dropdown on mount. */
  defaultOpen?: boolean;
  /** Classes for the control (the input, or the trigger button). */
  inputClassName?: string;
  /** Classes for the dropdown panel. */
  dropdownClassName?: string;
}

interface SelectOwnProps<
  T extends SelectOption,
> extends ComboboxSharedProps<T> {
  /** The selected value, or `null` for none. Leave unset to be uncontrolled. */
  value?: string | null;
  /** The initial value when uncontrolled. */
  defaultValue?: string | null;
  /** Called with the new value, or `null` when cleared. */
  onValueChange?: (value: string | null) => void;
  /**
   * Renders a text input that filters the options as you type. Otherwise
   * the control is a button, with typeahead.
   */
  searchable?: boolean;
  /** Choosing the selected option again clears it. */
  allowDeselect?: boolean;
  /** Adds a hidden input with this name and the value, for native forms. */
  name?: string;
}

/** Native props, for the control. */
type NativeControlProps = Omit<
  JSX.HTMLAttributes<HTMLElement>,
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'size'
  | 'label'
  | 'data'
  | 'placeholder'
  | 'disabled'
  | 'name'
  | 'required'
  | 'ref'
>;

export type SelectProps<T extends SelectOption = SelectOption> =
  SelectOwnProps<T> & Omit<NativeControlProps, keyof SelectOwnProps<T>>;

/**
 * Picks one value from a list, following the ARIA combobox pattern.
 * Replaces Mantine's `Select`. It looks like `TextInput` (same sizes, and
 * label, help text and error through `Field`).
 *
 * Searchable, it's a text input that filters the options as you type;
 * otherwise it's a button, and typing jumps to the matching option. Arrow
 * keys move through the options (skipping disabled ones), Enter chooses,
 * Escape and Tab close. Focus stays on the control. The dropdown matches
 * the control's width, scrolls past `maxDropdownHeight`, and works inside a
 * `Dialog`.
 *
 * The ref and any native props (`onFocus`, `autoFocus`, `aria-label`, …)
 * go to the control.
 *
 * ```tsx
 * <Select
 *   label="Role"
 *   data={[
 *     {value: 'ADMIN', label: 'Admin'},
 *     {value: 'EDITOR', label: 'Editor'},
 *   ]}
 *   value={role}
 *   onValueChange={setRole}
 * />
 * <Select
 *   aria-label="Timezone"
 *   data={Intl.supportedValuesOf('timeZone')}
 *   searchable
 *   clearable
 *   size="xs"
 *   value={tz}
 *   onValueChange={setTz}
 * />
 * ```
 */
// `forwardRef` drops the generic, so the result is re-typed.
export const Select = forwardRef<HTMLElement, SelectProps>((props, ref) => {
  const {
    data,
    value: valueProp,
    defaultValue = null,
    onValueChange,
    searchable = false,
    clearable = false,
    clearLabel = 'Clear',
    allowDeselect = false,
    creatable = false,
    getCreateLabel = defaultCreateLabel,
    onCreate,
    shouldCreate,
    filter,
    limit,
    nothingFound,
    renderOption,
    maxDropdownHeight = 280,
    defaultOpen,
    placeholder,
    disabled = false,
    name,
    label,
    description,
    error,
    required,
    size = 'sm',
    leftSection,
    rightSection,
    className,
    inputClassName,
    dropdownClassName,
    id: idProp,
    onKeyDown,
    onKeyUp,
    onClick,
    onBlur,
    ...rest
  } = props;
  const id = useFieldId(idProp as string | undefined);
  const field = needsField(props);
  const {required: requiredAttr, ...control} = fieldControlProps(id, props);

  const [value, setValue] = useControllableState<string | null>(
    valueProp,
    defaultValue,
    onValueChange
  );
  // The search text while the user is typing, else `null`.
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(() => resolveOptions(data), [data]);
  const selectedOption = options.find((option) => option.value === value);
  // Values that aren't in `data` (e.g. just created) show as typed.
  const selectedLabel = selectedOption?.label ?? (value || null);
  const hasValue = value !== null && value !== undefined && value !== '';

  const items = useMemo(
    () =>
      getComboboxItems({
        options,
        query: searchable ? query : null,
        filter,
        limit,
        creatable: creatable && searchable,
        shouldCreate,
      }),
    [options, query, searchable, filter, limit, creatable, shouldCreate]
  );

  const combobox = useCombobox({
    items,
    disabled,
    defaultOpen,
    hasEmptyState: nothingFound !== undefined && nothingFound !== null,
    getInitialIndex: (list) => {
      const index = list.findIndex(
        (item) => item.kind === 'option' && item.option.value === value
      );
      return index !== -1
        ? index
        : list.findIndex(
            (item) => !(item.kind === 'option' && item.option.disabled)
          );
    },
    onChoose: (item) => choose(item),
    onClose: (reason) => {
      // Leaving a searchable, clearable select with the text erased clears it.
      const left = reason === 'blur' || reason === 'outside';
      if (left && clearable && query !== null && query.trim() === '') {
        setValue(null);
      }
      setQuery(null);
    },
  });

  // Typing highlights the first match, so Enter picks it.
  useLayoutEffect(() => {
    if (query !== null) {
      combobox.setActiveIndex(nextEnabledIndex(items, -1, 1));
    }
  }, [query]);

  function choose(item: ComboboxItem) {
    if (item.kind === 'create') {
      const created = onCreate?.(item.query);
      const next =
        typeof created === 'string' ? created : (created?.value ?? item.query);
      setValue(next);
    } else if (allowDeselect && item.option.value === value) {
      setValue(null);
    } else if (item.option.value !== value) {
      setValue(item.option.value);
    }
    combobox.close('choose');
  }

  function onControlKeyDown(e: JSX.TargetedKeyboardEvent<HTMLElement>) {
    (onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
    if (disabled || e.defaultPrevented) {
      return;
    }
    const {open} = combobox;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          combobox.openList(
            e.key === 'ArrowUp' && !hasValue ? 'last' : 'initial'
          );
        } else {
          combobox.move(e.key === 'ArrowDown' ? 1 : -1);
        }
        return;
      case 'Home':
      case 'End':
        // In a text input, Home and End move the caret.
        if (searchable) {
          return;
        }
        e.preventDefault();
        combobox.openList(e.key === 'Home' ? 'first' : 'last');
        return;
      case 'Enter':
        if (open && combobox.active !== -1) {
          e.preventDefault();
          combobox.choose(combobox.active);
        } else if (!searchable) {
          e.preventDefault();
          if (open) {
            combobox.close();
          } else {
            combobox.openList();
          }
        }
        return;
      case ' ':
        if (searchable || combobox.isTypingAhead()) {
          break;
        }
        e.preventDefault();
        if (open && combobox.active !== -1) {
          combobox.choose(combobox.active);
        } else if (!open) {
          combobox.openList();
        }
        return;
      case 'Tab':
        combobox.close('blur');
        return;
    }
    if (!searchable && combobox.typeahead(e)) {
      e.preventDefault();
    }
  }

  function onControlClick(e: JSX.TargetedMouseEvent<HTMLElement>) {
    (onClick as ((e: MouseEvent) => void) | undefined)?.(e);
    if (disabled || e.defaultPrevented) {
      return;
    }
    if (!combobox.open) {
      combobox.openList();
    } else if (!searchable) {
      combobox.close();
    }
  }

  function onControlBlur(e: JSX.TargetedFocusEvent<HTMLElement>) {
    (onBlur as ((e: FocusEvent) => void) | undefined)?.(e);
    const next = e.relatedTarget as Node | null;
    if (!next || !combobox.floating?.contains(next)) {
      combobox.close('blur');
    }
  }

  const ariaProps = {
    role: 'combobox' as const,
    'aria-expanded': combobox.shown,
    'aria-haspopup': 'listbox' as const,
    'aria-controls': combobox.shown ? combobox.listboxId : undefined,
    'aria-activedescendant':
      combobox.shown && combobox.active !== -1
        ? combobox.optionId(combobox.active)
        : undefined,
    'aria-required': requiredAttr || undefined,
  };
  const controlClasses = cn(
    'Select__control',
    INPUT_BASE_CLASSES,
    INPUT_SIZE_CLASSES[size],
    'aria-expanded:border-focus',
    Boolean(leftSection) && INPUT_LEFT_PADDING_CLASSES[size],
    INPUT_RIGHT_PADDING_CLASSES[size],
    inputClassName
  );

  const showClear = clearable && hasValue && !disabled;
  const box = (
    <div
      ref={combobox.setReference}
      className={cn(
        'Select__box relative flex min-w-0 items-center',
        !field && 'Select',
        !field && className
      )}
    >
      {leftSection && (
        <span
          className={cn(
            'Select__leftSection pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-subtle',
            INPUT_SECTION_CLASSES[size]
          )}
          aria-hidden="true"
        >
          {leftSection}
        </span>
      )}
      {searchable ? (
        <input
          {...(rest as JSX.HTMLAttributes<HTMLInputElement>)}
          {...control}
          {...ariaProps}
          ref={ref as Ref<HTMLInputElement>}
          type="text"
          autoComplete="off"
          aria-autocomplete="list"
          placeholder={placeholder}
          disabled={disabled}
          value={query ?? selectedLabel ?? ''}
          className={cn('Select__input', controlClasses)}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            if (!combobox.open) {
              combobox.openList('first');
            }
          }}
          onKeyDown={onControlKeyDown}
          onKeyUp={onKeyUp}
          onClick={onControlClick}
          onBlur={onControlBlur}
        />
      ) : (
        <button
          {...(rest as JSX.HTMLAttributes<HTMLButtonElement>)}
          {...control}
          {...ariaProps}
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          disabled={disabled}
          className={cn(
            'Select__trigger flex cursor-pointer items-center text-left disabled:cursor-not-allowed',
            controlClasses
          )}
          onKeyDown={onControlKeyDown}
          // Space is handled on keydown; keep the browser from also clicking.
          onKeyUp={(e) => {
            (onKeyUp as ((e: KeyboardEvent) => void) | undefined)?.(e);
            if (e.key === ' ') {
              e.preventDefault();
            }
          }}
          onClick={onControlClick}
          onBlur={onControlBlur}
        >
          <span
            className={cn(
              'Select__value min-w-0 flex-1 truncate',
              // A real text node, not a placeholder, so it needs contrast.
              selectedLabel === null && 'text-muted'
            )}
          >
            {selectedLabel ?? placeholder ?? ' '}
          </span>
        </button>
      )}
      <span
        className={cn(
          'Select__rightSection absolute inset-y-0 right-0 flex items-center justify-center text-muted',
          INPUT_SECTION_CLASSES[size],
          INPUT_RIGHT_SECTION_CLASSES[size],
          !showClear && !rightSection && 'pointer-events-none'
        )}
      >
        {showClear ? (
          <button
            type="button"
            aria-label={clearLabel}
            className={cn('Select__clear', SELECT_CLEAR_CLASSES)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue(null);
              setQuery(null);
              combobox.close();
            }}
          >
            <IconX />
          </button>
        ) : (
          (rightSection ?? <IconSelector aria-hidden="true" />)
        )}
      </span>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
    </div>
  );

  const dropdown = (
    <ComboboxDropdown
      block="Select"
      combobox={combobox}
      items={items}
      isSelected={(v) => v === value}
      labelledBy={
        label ? fieldLabelId(id) : (rest['aria-labelledby'] as string)
      }
      label={rest['aria-label'] as string}
      nothingFound={nothingFound}
      maxDropdownHeight={maxDropdownHeight}
      getCreateLabel={getCreateLabel}
      renderOption={renderOption}
      className={dropdownClassName}
    />
  );

  if (!field) {
    return (
      <>
        {box}
        {dropdown}
      </>
    );
  }
  return (
    <Field
      id={id}
      label={label}
      description={description}
      error={error}
      required={required}
      size={size}
      className={cn('Select', className)}
    >
      {box}
      {dropdown}
    </Field>
  );
}) as <T extends SelectOption = SelectOption>(
  props: SelectProps<T> & {ref?: Ref<HTMLElement>}
) => VNode;

/** The default label of the create entry. */
export function defaultCreateLabel(query: string) {
  return `+ Create "${query}"`;
}
