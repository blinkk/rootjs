import {IconSelector, IconX} from '@tabler/icons-preact';
import type {ComponentChildren, JSX, Ref, VNode} from 'preact';
import {forwardRef} from 'preact/compat';
import {useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
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
  ComboboxDropdown,
  type ComboboxItem,
  getComboboxItems,
  nextEnabledIndex,
  type ResolvedOption,
  resolveOptions,
  type SelectOption,
  useCombobox,
} from '../Select/combobox.js';
import {
  type ComboboxSharedProps,
  defaultCreateLabel,
  SELECT_CLEAR_CLASSES,
} from '../Select/Select.js';
import type {InputSize} from '../TextInput/TextInput.js';

/** Box padding and min height, per size. Grows when the chips wrap. */
const BOX_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'min-h-control-xs py-px pointer-coarse:min-h-10',
  sm: 'min-h-control-sm py-0.5 pointer-coarse:min-h-10',
  md: 'min-h-control-md py-1 pointer-coarse:min-h-10',
};

/** Height of the chips and the inline input, per size. */
const ROW_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'h-5',
  sm: 'h-5',
  md: 'h-6',
};

/**
 * Left padding of the values row. With the inline input's own `px-1`, the
 * placeholder lines up with `TextInput`'s.
 */
const VALUES_PADDING_CLASSES: Record<InputSize, string> = {
  xs: 'pl-1',
  sm: 'pl-1.5',
  md: 'pl-2',
};

/** Height, padding and text size of the chips, per size. */
const CHIP_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'h-4 pl-2 text-xs',
  sm: 'h-4.5 pl-2.5 text-xs',
  md: 'h-5.5 pl-3 text-sm',
};

/** Text size of the inline input, per size. */
const INPUT_TEXT_CLASSES: Record<InputSize, string> = {
  xs: 'text-sm',
  sm: 'text-sm',
  md: 'text-base',
};

/** Width of the left and right sections, per size. */
const SECTION_CLASSES: Record<InputSize, string> = {
  xs: 'w-6 *:size-3.5 pointer-coarse:w-8',
  sm: 'w-7 *:size-4 pointer-coarse:w-9',
  md: 'w-9 *:size-4 pointer-coarse:w-10',
};

interface MultiSelectOwnProps<
  T extends SelectOption,
> extends ComboboxSharedProps<T> {
  /** The selected values, in order. Leave unset to be uncontrolled. */
  value?: string[];
  /** The initial values when uncontrolled. */
  defaultValue?: string[];
  /** Called with the new values. */
  onValueChange?: (value: string[]) => void;
  /**
   * Leaves selected options out of the dropdown (Mantine's behavior). Set
   * `false` to list them with a check mark; choosing one removes it.
   * Default `true`.
   */
  hideSelected?: boolean;
  /**
   * Renders a chip's label, e.g. an avatar and a name. The chip's shape and
   * remove button stay the same. Default: the option's label.
   */
  renderValue?: (option: ResolvedOption<T>) => ComponentChildren;
  /** Accessible name of a chip's remove button. Default `Remove {label}`. */
  getRemoveLabel?: (option: ResolvedOption<T>) => string;
  /** Adds a hidden input with this name and the values, comma separated. */
  name?: string;
}

type NativeInputProps = Omit<
  JSX.HTMLAttributes<HTMLInputElement>,
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

export type MultiSelectProps<T extends SelectOption = SelectOption> =
  MultiSelectOwnProps<T> & Omit<NativeInputProps, keyof MultiSelectOwnProps<T>>;

/**
 * Picks any number of values from a list. Selected values show as
 * removable chips inside the control, which wraps onto more lines as they
 * fill it. Replaces Mantine's `MultiSelect`; it's always searchable, and
 * shares `Select`'s options, creatable entry, keyboard support and sizes.
 *
 * Typing filters the options; arrow keys move through them, Enter adds the
 * highlighted one (the dropdown stays open, and the search clears),
 * Backspace in the empty input removes the last chip, and Escape or Tab
 * close the dropdown. The ref and any native props go to the `<input>`.
 *
 * ```tsx
 * <MultiSelect
 *   label="Collections"
 *   data={collections}
 *   value={selected}
 *   onValueChange={setSelected}
 *   clearable
 * />
 * <MultiSelect
 *   aria-label="Tags"
 *   data={tags}
 *   value={tags}
 *   onValueChange={setTags}
 *   creatable
 *   getCreateLabel={(query) => `+ Add tag ${query}`}
 * />
 * ```
 */
// `forwardRef` drops the generic, so the result is re-typed.
export const MultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(
  (props, ref) => {
    const {
      data,
      value: valueProp,
      defaultValue,
      onValueChange,
      hideSelected = true,
      renderValue,
      getRemoveLabel = (option) => `Remove ${option.label}`,
      clearable = false,
      clearLabel = 'Clear all',
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
      onBlur,
      ...rest
    } = props;
    const id = useFieldId(idProp as string | undefined);
    const field = needsField(props);
    const {required: requiredAttr, ...control} = fieldControlProps(id, props);
    const inputRef = useRef<HTMLInputElement>(null);
    const setInputRef = useMergedRef(inputRef, ref);

    const [value, setValue] = useControllableState<string[]>(
      valueProp,
      defaultValue ?? [],
      onValueChange
    );
    const [query, setQuery] = useState('');
    const options = useMemo(() => resolveOptions(data), [data]);
    const optionsByValue = useMemo(
      () => new Map(options.map((option) => [option.value, option])),
      [options]
    );
    // Values that aren't in `data` (e.g. just created) show as typed.
    const selectedOptions = value.map(
      (v) => optionsByValue.get(v) ?? ({value: v, label: v} as ResolvedOption)
    );

    const items = useMemo(
      () =>
        getComboboxItems({
          options,
          query: query || null,
          filter,
          limit,
          exclude: hideSelected ? value : undefined,
          creatable,
          shouldCreate,
        }),
      [
        options,
        query,
        filter,
        limit,
        hideSelected,
        value,
        creatable,
        shouldCreate,
      ]
    );

    const combobox = useCombobox({
      items,
      disabled,
      defaultOpen,
      hasEmptyState: nothingFound !== undefined && nothingFound !== null,
      getInitialIndex: (list) => nextEnabledIndex(list, -1, 1),
      onChoose: (item) => choose(item),
      onClose: () => setQuery(''),
    });

    // Typing highlights the first match, so Enter picks it.
    useLayoutEffect(() => {
      if (query) {
        combobox.setActiveIndex(nextEnabledIndex(items, -1, 1));
      }
    }, [query]);

    function choose(item: ComboboxItem) {
      if (item.kind === 'create') {
        const created = onCreate?.(item.query);
        const next =
          typeof created === 'string'
            ? created
            : (created?.value ?? item.query);
        if (!value.includes(next)) {
          setValue([...value, next]);
        }
      } else if (value.includes(item.option.value)) {
        setValue(value.filter((v) => v !== item.option.value));
      } else {
        setValue([...value, item.option.value]);
      }
      setQuery('');
    }

    function remove(v: string) {
      setValue(value.filter((current) => current !== v));
    }

    function onInputKeyDown(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) {
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
            combobox.openList(e.key === 'ArrowUp' ? 'last' : 'first');
          } else {
            combobox.move(e.key === 'ArrowDown' ? 1 : -1);
          }
          return;
        case 'Enter':
          if (open && combobox.active !== -1) {
            e.preventDefault();
            combobox.choose(combobox.active);
          }
          return;
        case 'Backspace':
          if (e.currentTarget.value === '' && value.length > 0) {
            e.preventDefault();
            remove(value[value.length - 1]);
          }
          return;
        case 'Tab':
          combobox.close('blur');
          return;
      }
    }

    function onInputBlur(e: JSX.TargetedFocusEvent<HTMLInputElement>) {
      (onBlur as ((e: FocusEvent) => void) | undefined)?.(e);
      const next = e.relatedTarget as Node | null;
      if (!next || !combobox.floating?.contains(next)) {
        combobox.close('blur');
      }
    }

    const showClear = clearable && value.length > 0 && !disabled;

    const box = (
      <div
        ref={combobox.setReference}
        className={cn(
          'MultiSelect__box flex min-w-0 cursor-text items-stretch rounded-sm border border-input-border bg-surface font-sans text-input-fg transition-colors',
          'focus-within:border-focus focus-within:outline-1 focus-within:outline-focus',
          'has-aria-invalid:border-danger has-aria-invalid:focus-within:outline-danger',
          // Unlike TextInput, a disabled box isn't faded with opacity: the
          // chips are text that still needs contrast.
          'has-disabled:cursor-not-allowed has-disabled:bg-surface-hover',
          BOX_SIZE_CLASSES[size],
          !field && 'MultiSelect',
          !field && className
        )}
        onMouseDown={(e) => {
          // Pressing the box (outside the input and chips) focuses the input
          // and toggles the dropdown.
          if (disabled || e.target === inputRef.current) {
            return;
          }
          if ((e.target as Element).closest('button')) {
            return;
          }
          e.preventDefault();
          inputRef.current?.focus();
          if (combobox.open) {
            combobox.close();
          } else {
            combobox.openList();
          }
        }}
      >
        {leftSection && (
          <span
            className={cn(
              'MultiSelect__leftSection pointer-events-none flex shrink-0 items-center justify-center text-input-placeholder',
              SECTION_CLASSES[size]
            )}
            aria-hidden="true"
          >
            {leftSection}
          </span>
        )}
        <div
          className={cn(
            'MultiSelect__values flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1',
            !leftSection && VALUES_PADDING_CLASSES[size]
          )}
        >
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className={cn(
                'MultiSelect__chip inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-input-chip font-medium leading-none text-input-chip-fg',
                CHIP_SIZE_CLASSES[size],
                disabled ? 'pr-2.5' : 'pr-0.5',
                'pointer-coarse:h-7'
              )}
            >
              <span className="MultiSelect__chipLabel min-w-0 truncate">
                {renderValue ? renderValue(option) : option.label}
              </span>
              {!disabled && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={getRemoveLabel(option)}
                  className="MultiSelect__chipRemove m-0 flex size-4 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-input-chip-fg hover:bg-surface-active *:size-2.5 pointer-coarse:size-6"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => remove(option.value)}
                >
                  <IconX aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          <input
            {...rest}
            {...control}
            ref={setInputRef}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={combobox.shown}
            aria-haspopup="listbox"
            aria-controls={combobox.shown ? combobox.listboxId : undefined}
            aria-activedescendant={
              combobox.shown && combobox.active !== -1
                ? combobox.optionId(combobox.active)
                : undefined
            }
            aria-required={requiredAttr || undefined}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : undefined}
            value={query}
            className={cn(
              'MultiSelect__input m-0 min-w-12 flex-1 basis-12 appearance-none border-0 bg-transparent p-0 px-1 font-sans text-input-fg shadow-none outline-none placeholder:text-input-placeholder disabled:cursor-not-allowed disabled:opacity-60',
              ROW_SIZE_CLASSES[size],
              INPUT_TEXT_CLASSES[size],
              inputClassName
            )}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              if (!combobox.open) {
                combobox.openList('first');
              }
            }}
            onClick={() => {
              if (!combobox.open) {
                combobox.openList();
              }
            }}
            onKeyDown={onInputKeyDown}
            onBlur={onInputBlur}
          />
        </div>
        <span
          className={cn(
            'MultiSelect__rightSection flex shrink-0 items-center justify-center self-center text-input-placeholder',
            SECTION_CLASSES[size],
            !showClear && !rightSection && 'pointer-events-none'
          )}
        >
          {showClear ? (
            <button
              type="button"
              aria-label={clearLabel}
              className={cn('MultiSelect__clear', SELECT_CLEAR_CLASSES)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue([]);
                setQuery('');
              }}
            >
              <IconX />
            </button>
          ) : (
            (rightSection ?? <IconSelector aria-hidden="true" />)
          )}
        </span>
        {name && <input type="hidden" name={name} value={value.join(',')} />}
      </div>
    );

    const dropdown = (
      <ComboboxDropdown
        block="MultiSelect"
        combobox={combobox}
        items={items}
        isSelected={(v) => value.includes(v)}
        multiple
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
        className={cn('MultiSelect', className)}
      >
        {box}
        {dropdown}
      </Field>
    );
  }
) as <T extends SelectOption = SelectOption>(
  props: MultiSelectProps<T> & {ref?: Ref<HTMLInputElement>}
) => VNode;
