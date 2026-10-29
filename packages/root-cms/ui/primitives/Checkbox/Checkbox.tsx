import {IconCheck, IconMinus} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {useLayoutEffect, useRef} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {
  FieldDescription,
  FieldError,
  type FieldLabelProps,
  FieldRequired,
  fieldControlProps,
  fieldDescriptionId,
  fieldErrorId,
  hasErrorMessage,
  useFieldId,
} from '../Field/Field.js';

export type CheckboxSize = 'sm' | 'md';

/**
 * Classes for the hidden native input of a checkbox-like control. It sits
 * over the drawn control (so clicks land on it) and grows to a 40px target
 * on coarse pointers. The drawn parts follow it as `peer-*` siblings.
 */
export const TOGGLE_INPUT_CLASSES =
  'peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed pointer-coarse:-inset-3';

/** Label text size, per size. */
export const TOGGLE_LABEL_SIZE_CLASSES: Record<CheckboxSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
};

const BOX_SIZE_CLASSES: Record<CheckboxSize, string> = {
  sm: 'size-4',
  md: 'size-5',
};

/**
 * Checked colors. `default` keeps the white box and draws a dark check;
 * `black` fills with the primary color; `blue` is Mantine's (the
 * `--cms-button-blue` token).
 */
export type CheckboxColor = 'default' | 'black' | 'blue';

const BOX_COLOR_CLASSES: Record<CheckboxColor, string> = {
  default: 'border-border-strong peer-hover:border-muted',
  black:
    'border-border-strong peer-hover:border-muted peer-checked:border-primary peer-checked:bg-primary peer-indeterminate:border-primary peer-indeterminate:bg-primary',
  blue: 'border-border-strong peer-hover:border-muted peer-checked:border-button-blue peer-checked:bg-button-blue peer-indeterminate:border-button-blue peer-indeterminate:bg-button-blue',
};

const ICON_COLOR_CLASSES: Record<CheckboxColor, string> = {
  default: 'text-strong',
  black: 'text-on-primary',
  blue: 'text-on-primary',
};

/** Offsets the control so it centers on the label's first line. */
const CONTROL_OFFSET_CLASSES: Record<CheckboxSize, string> = {
  sm: 'mt-0.5',
  md: 'mt-px',
};

interface CheckboxOwnProps extends FieldLabelProps {
  /** Box and label size: `sm` 16px, `md` 20px. Default `sm`. */
  size?: CheckboxSize;
  /**
   * Checked style: `default` (white box, dark check), `black` (filled) or
   * `blue` (filled, Mantine's). Default `default`.
   */
  color?: CheckboxColor;
  /** Shows a dash instead of a check, for a partly selected group. */
  indeterminate?: boolean;
  /** Classes for the root. */
  className?: string;
}

export type CheckboxProps = CheckboxOwnProps &
  Omit<JSX.InputHTMLAttributes<HTMLInputElement>, keyof CheckboxOwnProps>;

/**
 * A checkbox with an optional label, help text and error. Replaces
 * Mantine's `Checkbox`. The ref and any native props (`checked`,
 * `onChange`, `name`, …) go to the native `<input type="checkbox">`.
 * Without a `label`, give it an `aria-label`.
 *
 * ```tsx
 * <Checkbox
 *   label="Archive after publishing"
 *   description="Hides the doc from the collection list."
 *   checked={archive}
 *   onChange={(e) => setArchive(e.currentTarget.checked)}
 * />
 * ```
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (props, ref) => {
    const {
      label,
      description,
      error,
      required,
      size = 'sm',
      color = 'default',
      indeterminate = false,
      className,
      id: idProp,
      ...inputProps
    } = props;
    const id = useFieldId(idProp as string | undefined);
    const control = fieldControlProps(id, props);
    const innerRef = useRef<HTMLInputElement>(null);
    const setRefs = useMergedRef(innerRef, ref);

    // `indeterminate` is a DOM property with no attribute.
    useLayoutEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <div
        className={cn(
          'Checkbox',
          `Checkbox--size-${size}`,
          `Checkbox--color-${color}`,
          'flex min-w-0 items-start',
          className
        )}
      >
        <span
          className={cn(
            'Checkbox__control relative inline-flex shrink-0',
            BOX_SIZE_CLASSES[size],
            label ? CONTROL_OFFSET_CLASSES[size] : null
          )}
        >
          <input
            {...inputProps}
            {...control}
            ref={setRefs}
            type="checkbox"
            className={TOGGLE_INPUT_CLASSES}
          />
          <span
            className={cn(
              'Checkbox__box pointer-events-none absolute inset-0 rounded-sm border bg-surface transition-colors',
              BOX_COLOR_CLASSES[color],
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              'peer-aria-invalid:border-danger',
              'peer-disabled:opacity-50'
            )}
            aria-hidden="true"
          />
          {indeterminate ? (
            <IconMinus
              className={cn(
                'Checkbox__icon pointer-events-none absolute inset-0 m-auto hidden size-3/4 peer-indeterminate:block',
                ICON_COLOR_CLASSES[color]
              )}
              stroke={3}
              aria-hidden="true"
            />
          ) : (
            <IconCheck
              className={cn(
                'Checkbox__icon pointer-events-none absolute inset-0 m-auto hidden size-3/4 peer-checked:block',
                ICON_COLOR_CLASSES[color]
              )}
              stroke={3}
              aria-hidden="true"
            />
          )}
        </span>
        {/*
         * The space next to the box is padding on the label (and the text
         * under it), not a gap, so clicking it toggles the checkbox.
         */}
        {(label || description || hasErrorMessage(error)) && (
          <div className="Checkbox__body flex min-w-0 flex-col gap-0.5">
            {label && (
              <label
                htmlFor={id}
                className={cn(
                  'Checkbox__label cursor-pointer pl-2 leading-snug text-fg',
                  TOGGLE_LABEL_SIZE_CLASSES[size],
                  Boolean(inputProps.disabled) &&
                    'cursor-not-allowed opacity-60'
                )}
              >
                {label}
                {required && <FieldRequired />}
              </label>
            )}
            {description && (
              <FieldDescription className="pl-2" id={fieldDescriptionId(id)}>
                {description}
              </FieldDescription>
            )}
            {hasErrorMessage(error) && (
              <FieldError className="pl-2" id={fieldErrorId(id)}>
                {error}
              </FieldError>
            )}
          </div>
        )}
      </div>
    );
  }
);
