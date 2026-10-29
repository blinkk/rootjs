import type {JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {type ClassNames, cn} from '../../utils/classes.js';
import {
  type CheckboxSize,
  TOGGLE_INPUT_CLASSES,
  TOGGLE_LABEL_SIZE_CLASSES,
} from '../Checkbox/Checkbox.js';
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

export type SwitchSize = CheckboxSize;

const TRACK_SIZE_CLASSES: Record<SwitchSize, string> = {
  sm: 'h-4 w-7.5',
  md: 'h-5 w-9.5',
};

const THUMB_SIZE_CLASSES: Record<SwitchSize, string> = {
  sm: 'left-0.5 top-0.5 size-3 peer-checked:translate-x-3.5',
  md: 'left-0.75 top-0.75 size-3.5 peer-checked:translate-x-4.5',
};

/** Offsets the track so it centers on the label's first line. */
const CONTROL_OFFSET_CLASSES: Record<SwitchSize, string> = {
  sm: 'mt-0.5',
  md: 'mt-px',
};

interface SwitchOwnProps extends FieldLabelProps {
  /** Track and label size: `sm` 30×16px, `md` 38×20px (Mantine `xs`, `sm`). Default `sm`. */
  size?: SwitchSize;
  /** Puts the label before the switch instead of after it. */
  labelPosition?: 'left' | 'right';
  /** Classes for the root. */
  className?: string;
  /** Classes for inner elements: `label`. */
  classNames?: ClassNames<'label'>;
}

export type SwitchProps = SwitchOwnProps &
  Omit<JSX.InputHTMLAttributes<HTMLInputElement>, keyof SwitchOwnProps>;

/**
 * An on/off switch, for settings that apply immediately. Replaces Mantine's
 * `Switch`. It's a native checkbox with `role="switch"`; the ref and any
 * native props (`checked`, `onChange`, …) go to it.
 *
 * ```tsx
 * <Switch
 *   label="Show archived"
 *   checked={showArchived}
 *   onChange={(e) => setShowArchived(e.currentTarget.checked)}
 * />
 * ```
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (props, ref) => {
    const {
      label,
      description,
      error,
      required,
      size = 'sm',
      labelPosition = 'right',
      className,
      classNames,
      id: idProp,
      ...inputProps
    } = props;
    const id = useFieldId(idProp as string | undefined);
    const control = fieldControlProps(id, props);

    return (
      <div
        className={cn(
          'Switch',
          `Switch--size-${size}`,
          'flex min-w-0 items-start gap-3',
          labelPosition === 'left' && 'Switch--labelLeft flex-row-reverse',
          labelPosition === 'left' && Boolean(label) && 'justify-end',
          className
        )}
      >
        <span
          className={cn(
            'Switch__control relative inline-flex shrink-0',
            TRACK_SIZE_CLASSES[size],
            label ? CONTROL_OFFSET_CLASSES[size] : null
          )}
        >
          <input
            {...inputProps}
            {...control}
            ref={ref}
            type="checkbox"
            role="switch"
            className={TOGGLE_INPUT_CLASSES}
          />
          <span
            className={cn(
              'Switch__track pointer-events-none absolute inset-0 rounded-full bg-border-strong transition-colors',
              'peer-checked:bg-primary',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              'peer-aria-invalid:outline-1 peer-aria-invalid:outline-danger',
              'peer-disabled:opacity-50'
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'Switch__thumb pointer-events-none absolute rounded-full border border-border-strong bg-surface shadow-sm transition-[translate,border-color]',
              'peer-checked:border-primary peer-checked:peer-disabled:border-primary/50',
              THUMB_SIZE_CLASSES[size]
            )}
            aria-hidden="true"
          />
        </span>
        {(label || description || hasErrorMessage(error)) && (
          <div className="Switch__body flex min-w-0 flex-col gap-0.5">
            {label && (
              <label
                htmlFor={id}
                className={cn(
                  'Switch__label cursor-pointer leading-snug text-fg',
                  TOGGLE_LABEL_SIZE_CLASSES[size],
                  Boolean(inputProps.disabled) &&
                    'cursor-not-allowed opacity-60',
                  classNames?.label
                )}
              >
                {label}
                {required && <FieldRequired />}
              </label>
            )}
            {description && (
              <FieldDescription id={fieldDescriptionId(id)}>
                {description}
              </FieldDescription>
            )}
            {hasErrorMessage(error) && (
              <FieldError id={fieldErrorId(id)}>{error}</FieldError>
            )}
          </div>
        )}
      </div>
    );
  }
);
