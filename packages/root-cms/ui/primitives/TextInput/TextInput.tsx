import './TextInput.css';
import type {ComponentChildren, JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {type ClassNames, cn} from '../../utils/classes.js';
import {
  Field,
  type FieldLabelProps,
  type FieldSize,
  fieldControlProps,
  needsField,
  useFieldId,
} from '../Field/Field.js';

export type InputSize = FieldSize;

/** Input types that show the browser's date or time picker. */
const DATETIME_TYPES = new Set([
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

/**
 * The input box shared by every text-like control (`TextInput`, `Textarea`,
 * `NumberInput`, and later `Select`): border, background, placeholder,
 * focus border (a color change only, as in Mantine), and the invalid, disabled and read-only states. Pair it with
 * `INPUT_SIZE_CLASSES` (single-line) or your own padding (multi-line).
 */
export const INPUT_BASE_CLASSES =
  'm-0 block w-full min-w-0 appearance-none rounded-sm border border-input-border bg-surface font-sans text-input-fg shadow-none transition-colors ' +
  'placeholder:text-input-placeholder ' +
  'focus-visible:border-focus focus-visible:outline-none ' +
  'aria-invalid:border-danger aria-invalid:focus-visible:border-danger ' +
  'disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted disabled:opacity-60';

/**
 * Height, horizontal padding and text size of single-line inputs. Inputs
 * grow to 40px on coarse pointers.
 */
export const INPUT_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'h-control-xs px-2 text-sm pointer-coarse:h-10',
  sm: 'h-control-sm px-2.5 text-sm pointer-coarse:h-10',
  md: 'h-control-md px-3 text-base pointer-coarse:h-10',
};

/** Left padding that makes room for a left section, per size. */
export const INPUT_LEFT_PADDING_CLASSES: Record<InputSize, string> = {
  xs: 'pl-6 pointer-coarse:pl-8',
  sm: 'pl-7 pointer-coarse:pl-9',
  md: 'pl-9',
};

/** Right padding that makes room for a right section, per size. */
export const INPUT_RIGHT_PADDING_CLASSES: Record<InputSize, string> = {
  xs: 'pr-6 pointer-coarse:pr-10',
  sm: 'pr-7 pointer-coarse:pr-10',
  md: 'pr-9 pointer-coarse:pr-10',
};

/** Width of the left and right sections, per size (square with the input). */
export const INPUT_SECTION_CLASSES: Record<InputSize, string> = {
  xs: 'w-6 [&>svg]:size-3.5 pointer-coarse:w-8',
  sm: 'w-7 [&>svg]:size-4 pointer-coarse:w-9',
  md: 'w-9 [&>svg]:size-4',
};

/** Right sections are wider on coarse pointers, for a clickable target. */
export const INPUT_RIGHT_SECTION_CLASSES: Record<InputSize, string> = {
  xs: 'w-6 pointer-coarse:w-10',
  sm: 'w-7 pointer-coarse:w-10',
  md: 'w-9 pointer-coarse:w-10',
};

/** Props shared by `TextInput` and the controls built on it. */
export interface InputChromeProps extends FieldLabelProps {
  /** Height: `xs` 24px, `sm` 28px, `md` 36px. Default `sm`. */
  size?: InputSize;
  /**
   * Content inside the input's left edge, usually an icon such as
   * `<IconSearch />`. Sized and colored by the input, and not clickable.
   */
  leftSection?: ComponentChildren;
  /**
   * Content inside the input's right edge: an icon, a unit, or a small
   * control like an `IconButton` (size `xs`). Clickable.
   */
  rightSection?: ComponentChildren;
  /** Classes for the root (the `Field`, or the input box when bare). */
  className?: string;
  /** Classes for inner elements: `input` (the native `<input>`). */
  classNames?: ClassNames<'input'>;
}

export type TextInputProps = InputChromeProps &
  Omit<JSX.InputHTMLAttributes<HTMLInputElement>, keyof InputChromeProps>;

/**
 * A single-line text input, with an optional label, help text and error.
 * Replaces Mantine's `TextInput`. The ref and any native props go to the
 * `<input>`. Date and time types (`type="date"`, `"time"`,
 * `"datetime-local"`) use the browser's picker, styled to match.
 *
 * ```tsx
 * <TextInput
 *   label="Slug"
 *   description="Lowercase letters, numbers and dashes."
 *   value={slug}
 *   onInput={(e) => setSlug(e.currentTarget.value)}
 *   error={slugError}
 * />
 * <TextInput aria-label="Search" leftSection={<IconSearch />} size="xs" />
 * ```
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (props, ref) => {
    const {
      label,
      description,
      error,
      required,
      size = 'sm',
      leftSection,
      rightSection,
      className,
      classNames,
      id: idProp,
      type = 'text',
      ...inputProps
    } = props;
    const id = useFieldId(idProp as string | undefined);
    const field = needsField(props);
    const control = fieldControlProps(id, props);

    const box = (
      <div
        className={cn(
          'TextInput__box relative flex min-w-0 items-center',
          !field && 'TextInput',
          !field && className
        )}
      >
        {leftSection && (
          <span
            className={cn(
              'TextInput__leftSection pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-input-placeholder',
              INPUT_SECTION_CLASSES[size]
            )}
            aria-hidden="true"
          >
            {leftSection}
          </span>
        )}
        <input
          {...inputProps}
          {...control}
          ref={ref}
          type={type}
          className={cn(
            'TextInput__input',
            DATETIME_TYPES.has(type as string) && 'TextInput__input--datetime',
            INPUT_BASE_CLASSES,
            INPUT_SIZE_CLASSES[size],
            Boolean(leftSection) && INPUT_LEFT_PADDING_CLASSES[size],
            Boolean(rightSection) && INPUT_RIGHT_PADDING_CLASSES[size],
            classNames?.input
          )}
        />
        {rightSection && (
          <span
            className={cn(
              'TextInput__rightSection absolute inset-y-0 right-0 flex items-center justify-center text-muted',
              INPUT_RIGHT_SECTION_CLASSES[size]
            )}
          >
            {rightSection}
          </span>
        )}
      </div>
    );

    if (!field) {
      return box;
    }
    return (
      <Field
        id={id}
        label={label}
        description={description}
        error={error}
        required={required}
        size={size}
        className={cn('TextInput', className)}
      >
        {box}
      </Field>
    );
  }
);
