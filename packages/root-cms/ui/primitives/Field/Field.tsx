import type {ComponentChildren} from 'preact';
import {useId} from 'preact/hooks';
import {cn} from '../../utils/classes.js';

export type FieldSize = 'xs' | 'sm' | 'md';

/**
 * The label, help text and error props every form control accepts. Controls
 * render through `Field` when any of them is set, and render bare otherwise.
 */
export interface FieldLabelProps {
  /** The visible label. */
  label?: ComponentChildren;
  /** Help text, shown between the label and the control. */
  description?: ComponentChildren;
  /**
   * Marks the control invalid. A string or element is shown beneath the
   * control as the error message; `true` only applies the invalid style.
   */
  error?: ComponentChildren;
  /** Adds a required indicator to the label and `required` to the control. */
  required?: boolean;
}

/** Props `Field` hands to its control, when `children` is a function. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps extends FieldLabelProps {
  /** The control's id. Generated when omitted. */
  id?: string;
  /**
   * Sizes the label to match the control: `xs` and `sm` use 12px labels,
   * `md` 14px. Default `sm`.
   */
  size?: FieldSize;
  /**
   * `label` (default) renders a `<label for={id}>`. Use `div` for controls
   * that aren't a single labelable element (radio groups, custom widgets);
   * they reference the label with `aria-labelledby={fieldLabelId(id)}`.
   */
  labelAs?: 'label' | 'div';
  /** Extra ids to describe the control with, after the help and error. */
  describedBy?: string;
  className?: string;
  /**
   * The control. Pass a function to receive the ids and ARIA attributes to
   * spread onto it.
   */
  children?:
    ComponentChildren | ((control: FieldControlProps) => ComponentChildren);
}

/** Returns `id`, or a generated one when it's empty. */
export function useFieldId(id?: string): string {
  const generated = useId();
  return id || `field-${generated}`;
}

/** The id of a field's label element. */
export function fieldLabelId(id: string) {
  return `${id}-label`;
}

/** The id of a field's help text. */
export function fieldDescriptionId(id: string) {
  return `${id}-description`;
}

/** The id of a field's error message. */
export function fieldErrorId(id: string) {
  return `${id}-error`;
}

/** Whether `error` is a message to show, rather than just an invalid flag. */
export function hasErrorMessage(error: ComponentChildren) {
  return (
    error !== undefined && error !== null && error !== false && error !== true
  );
}

/**
 * Whether a control with these props needs the `Field` wrapper (a label,
 * help text or error message), or can render bare.
 */
export function needsField(props: FieldLabelProps) {
  return Boolean(
    props.label || props.description || hasErrorMessage(props.error)
  );
}

/**
 * Builds the ids and ARIA attributes that connect a control to its field's
 * help text and error message.
 *
 * ```tsx
 * const id = useFieldId(props.id);
 * <input {...fieldControlProps(id, props)} />
 * ```
 */
export function fieldControlProps(
  id: string,
  props: FieldLabelProps & {'aria-describedby'?: unknown}
): FieldControlProps {
  const describedBy = [
    props.description ? fieldDescriptionId(id) : null,
    hasErrorMessage(props.error) ? fieldErrorId(id) : null,
    typeof props['aria-describedby'] === 'string'
      ? props['aria-describedby']
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  // Keys are only set when they apply, so spreading the result after the
  // caller's native props doesn't clear their own `aria-invalid`.
  const control: FieldControlProps = {id};
  if (describedBy) {
    control['aria-describedby'] = describedBy;
  }
  if (props.error) {
    control['aria-invalid'] = true;
  }
  if (props.required) {
    control.required = true;
  }
  return control;
}

const LABEL_SIZE_CLASSES: Record<FieldSize, string> = {
  xs: 'text-sm',
  sm: 'text-sm',
  md: 'text-base',
};

/** A field's help text. Used by `Field`, `Checkbox` and `Switch`. */
export function FieldDescription(props: {
  id: string;
  className?: string;
  children: ComponentChildren;
}) {
  return (
    <div
      id={props.id}
      className={cn(
        'Field__description text-sm leading-snug text-muted',
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

/** A field's error message. Used by `Field`, `Checkbox` and `Switch`. */
export function FieldError(props: {
  id: string;
  className?: string;
  children: ComponentChildren;
}) {
  return (
    <div
      id={props.id}
      className={cn(
        'Field__error text-sm leading-snug text-danger',
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

/** The required indicator. Hidden from screen readers, which read `required`. */
export function FieldRequired() {
  return (
    <span className="Field__required ml-0.5 text-danger" aria-hidden="true">
      *
    </span>
  );
}

/**
 * A form control's label, help text and error message, wired to the control
 * by id. Replaces Mantine's `InputWrapper`. The inputs (`TextInput`,
 * `Textarea`, …) render through it when given `label`, `description` or
 * `error`, so call it directly only to label a custom control.
 *
 * ```tsx
 * <Field label="Docs" description="Docs to add to the release.">
 *   {(control) => <DocPicker {...control} />}
 * </Field>
 * ```
 */
export function Field(props: FieldProps) {
  const id = useFieldId(props.id);
  const size = props.size ?? 'sm';
  const labelAs = props.labelAs ?? 'label';
  const control = fieldControlProps(id, {
    ...props,
    'aria-describedby': props.describedBy,
  });
  const labelClasses = cn(
    'Field__label block font-medium leading-snug text-fg',
    LABEL_SIZE_CLASSES[size]
  );
  const labelContent = (
    <>
      {props.label}
      {props.required && <FieldRequired />}
    </>
  );

  return (
    <div className={cn('Field flex min-w-0 flex-col gap-1', props.className)}>
      {props.label &&
        (labelAs === 'label' ? (
          <label id={fieldLabelId(id)} htmlFor={id} className={labelClasses}>
            {labelContent}
          </label>
        ) : (
          <div id={fieldLabelId(id)} className={labelClasses}>
            {labelContent}
          </div>
        ))}
      {props.description && (
        <FieldDescription id={fieldDescriptionId(id)}>
          {props.description}
        </FieldDescription>
      )}
      {typeof props.children === 'function'
        ? props.children(control)
        : props.children}
      {hasErrorMessage(props.error) && (
        <FieldError id={fieldErrorId(id)}>{props.error}</FieldError>
      )}
    </div>
  );
}
