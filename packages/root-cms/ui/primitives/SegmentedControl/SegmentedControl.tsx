import './SegmentedControl.css';

import type {ComponentChildren, FunctionComponent, JSX, Ref} from 'preact';
import {forwardRef} from 'preact/compat';
import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {
  Field,
  type FieldLabelProps,
  fieldControlProps,
  fieldLabelId,
  needsField,
  useFieldId,
} from '../Field/Field.js';
import type {InputSize} from '../TextInput/TextInput.js';

/** One option of a `SegmentedControl`. */
export interface SegmentedControlItem<T extends string = string> {
  value: T;
  /** What the segment shows: text, or an icon with text. */
  label: ComponentChildren;
  /**
   * The segment's accessible name, when `label` has no text (an icon-only
   * segment). Also shown as a native tooltip.
   */
  ariaLabel?: string;
  disabled?: boolean;
}

interface SegmentedControlOwnProps<T extends string> extends Omit<
  FieldLabelProps,
  'required'
> {
  /** The options, in order. A plain string is both value and label. */
  data: ReadonlyArray<SegmentedControlItem<T> | T>;
  /** The selected value. */
  value: T;
  /** Called with the newly selected value. */
  onValueChange: (value: T) => void;
  /**
   * Size: `xs` (about 32px tall, 12px text) matches Mantine's `xs`, `sm`
   * (about 36px) sits between, and `md` (about 40px, 14px text) matches
   * Mantine's `sm`. Default `sm`.
   */
  size?: InputSize;
  /** Stretches to its container, with equal-width segments. */
  fullWidth?: boolean;
  /** Disables every segment. */
  disabled?: boolean;
  /** Classes for the root (the `Field`, or the group when bare). */
  className?: string;
}

export type SegmentedControlProps<T extends string = string> =
  SegmentedControlOwnProps<T> &
    Omit<
      JSX.HTMLAttributes<HTMLDivElement>,
      keyof SegmentedControlOwnProps<T> | 'onChange'
    >;

/** Segment padding, matching Mantine's (the group adds 4px around them). */
const ITEM_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'gap-1 px-1.5 py-0.75 text-sm',
  sm: 'gap-1.5 px-2.5 py-1.25 text-sm',
  md: 'gap-1.5 px-2.5 py-1.25 text-base',
};

/**
 * A row of mutually exclusive options, like a compact radio group: view
 * switchers and filters. Replaces Mantine's `SegmentedControl`. It's a
 * `radiogroup`; arrow keys, Home and End move the selection. On narrow
 * screens it scrolls sideways instead of overflowing. Without a `label`,
 * give it an `aria-label`.
 *
 * ```tsx
 * <SegmentedControl
 *   aria-label="Task filters"
 *   value={filter}
 *   onValueChange={setFilter}
 *   data={[
 *     {value: 'open', label: 'Open'},
 *     {value: 'done', label: 'Done'},
 *   ]}
 * />
 * ```
 */
// `forwardRef` drops the generic, so the result is re-typed.
export const SegmentedControl = forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>((props, ref) => {
  const {
    data,
    value,
    onValueChange,
    size = 'sm',
    fullWidth = false,
    disabled = false,
    label,
    description,
    error,
    className,
    id: idProp,
    ...rootProps
  } = props;
  const id = useFieldId(idProp as string | undefined);
  const field = needsField(props);
  const control = fieldControlProps(id, props);
  const groupRef = useRef<HTMLDivElement>(null);
  const setGroupRef = useMergedRef(groupRef, ref);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const indicator = useIndicator(groupRef, itemRefs, value);
  const items = data.map((item) =>
    typeof item === 'string' ? {value: item, label: item} : item
  ) as SegmentedControlItem[];
  const enabled = (item: SegmentedControlItem) => !disabled && !item.disabled;
  // Only one segment is in the tab order: the selected one, or the first
  // enabled one when nothing selectable is selected.
  const selectedIndex = items.findIndex(
    (item) => item.value === value && enabled(item)
  );
  const tabIndex =
    selectedIndex >= 0 ? selectedIndex : items.findIndex(enabled);

  function select(index: number) {
    const item = items[index];
    itemRefs.current[index]?.focus();
    if (item.value !== value) {
      onValueChange(item.value);
    }
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    const enabledIndexes = items
      .map((item, i) => (enabled(item) ? i : -1))
      .filter((i) => i >= 0);
    const pos = enabledIndexes.indexOf(index);
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = enabledIndexes[(pos + 1) % enabledIndexes.length];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next =
        enabledIndexes[
          (pos - 1 + enabledIndexes.length) % enabledIndexes.length
        ];
    } else if (e.key === 'Home') {
      next = enabledIndexes[0];
    } else if (e.key === 'End') {
      next = enabledIndexes[enabledIndexes.length - 1];
    }
    if (next !== undefined) {
      e.preventDefault();
      select(next);
    }
  }

  const group = (
    <div
      {...rootProps}
      {...control}
      ref={setGroupRef}
      role="radiogroup"
      aria-labelledby={label ? fieldLabelId(id) : rootProps['aria-labelledby']}
      aria-disabled={disabled || undefined}
      className={cn(
        'SegmentedControl__group',
        !field && 'SegmentedControl',
        `SegmentedControl--size-${size}`,
        fullWidth && 'SegmentedControl--fullWidth',
        'relative max-w-full overflow-x-auto rounded-md bg-track p-1',
        'aria-invalid:outline-1 aria-invalid:outline-danger',
        fullWidth ? 'flex w-full' : 'inline-flex',
        'pointer-coarse:min-h-10',
        !field && className
      )}
    >
      {/* The selected segment's background, which slides between segments. */}
      <span
        className={cn(
          'SegmentedControl__indicator',
          'pointer-events-none absolute inset-y-1 left-0 rounded-sm bg-surface shadow-sm',
          indicator.animate &&
            'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          !indicator.rect && 'hidden'
        )}
        style={
          indicator.rect
            ? {
                width: `${indicator.rect.width}px`,
                transform: `translateX(${indicator.rect.left}px)`,
              }
            : undefined
        }
        aria-hidden="true"
      />
      {items.map((item, index) => {
        const checked = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={item.ariaLabel}
            title={item.ariaLabel}
            disabled={!enabled(item)}
            tabIndex={index === tabIndex ? 0 : -1}
            className={cn(
              'SegmentedControl__item',
              'm-0 inline-flex shrink-0 cursor-pointer select-none appearance-none items-center justify-center whitespace-nowrap rounded-sm bg-transparent font-sans font-medium text-muted transition-colors',
              'hover:text-strong',
              'relative aria-checked:text-strong',
              // Until the indicator is measured, the segment draws its own.
              !indicator.rect &&
                'aria-checked:bg-surface aria-checked:shadow-sm',
              'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
              'disabled:cursor-not-allowed disabled:opacity-50',
              fullWidth && 'flex-1',
              ITEM_SIZE_CLASSES[size]
            )}
            onClick={() => select(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (!field) {
    return group;
  }
  return (
    <Field
      id={id}
      label={label}
      description={description}
      error={error}
      size={size}
      labelAs="div"
      className={cn('SegmentedControl', className)}
    >
      {group}
    </Field>
  );
}) as unknown as <T extends string = string>(
  props: SegmentedControlProps<T> & {ref?: Ref<HTMLDivElement>}
) => ReturnType<FunctionComponent>;

/**
 * Measures the selected segment so the indicator can sit behind it, and
 * re-measures when the group resizes. Movement is animated only after the
 * first placement, so it doesn't slide in on mount.
 */
function useIndicator(
  groupRef: {current: HTMLDivElement | null},
  itemRefs: {current: Array<HTMLButtonElement | null>},
  value: string
) {
  const [rect, setRect] = useState<{left: number; width: number} | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const measure = () => {
      const item = itemRefs.current.find(
        (el) => el?.getAttribute('aria-checked') === 'true'
      );
      setRect(item ? {left: item.offsetLeft, width: item.offsetWidth} : null);
    };
    measure();
    const frame = requestAnimationFrame(() => setAnimate(true));
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value]);

  return {rect, animate};
}
