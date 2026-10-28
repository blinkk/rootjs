import type {JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {useCallback, useLayoutEffect, useRef} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {type ClassNames, cn} from '../../utils/classes.js';
import {
  Field,
  type FieldLabelProps,
  fieldControlProps,
  needsField,
  useFieldId,
} from '../Field/Field.js';
import {INPUT_BASE_CLASSES, type InputSize} from '../TextInput/TextInput.js';

/** Padding and text size of multi-line inputs, per size. */
export const TEXTAREA_SIZE_CLASSES: Record<InputSize, string> = {
  xs: 'px-2 py-0.5 text-sm',
  sm: 'px-2.5 py-1 text-sm',
  md: 'px-3 py-1.5 text-base',
};

interface TextareaOwnProps extends FieldLabelProps {
  /** Padding and text size, matching `TextInput`'s sizes. Default `sm`. */
  size?: InputSize;
  /**
   * Grows and shrinks with its content, between `minRows` and `maxRows`,
   * instead of being resized by hand.
   */
  autosize?: boolean;
  /**
   * The smallest height, in rows. Without `autosize`, this is the fixed
   * height (the native `rows`). Default 2.
   */
  minRows?: number;
  /** With `autosize`, the tallest it grows before scrolling. Default no limit. */
  maxRows?: number;
  /** Classes for the root (the `Field`, or the textarea when bare). */
  className?: string;
  /** Classes for inner elements: `input` (the native `<textarea>`). */
  classNames?: ClassNames<'input'>;
}

export type TextareaProps = TextareaOwnProps &
  Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof TextareaOwnProps>;

/**
 * A multi-line text input, with an optional label, help text and error, that
 * can grow with its content. Replaces Mantine's `Textarea`. The ref and any
 * native props go to the `<textarea>`.
 *
 * ```tsx
 * <Textarea
 *   label="Notes"
 *   autosize
 *   minRows={2}
 *   maxRows={8}
 *   value={notes}
 *   onInput={(e) => setNotes(e.currentTarget.value)}
 * />
 * ```
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (props, ref) => {
    const {
      label,
      description,
      error,
      required,
      size = 'sm',
      autosize = false,
      minRows = 2,
      maxRows,
      className,
      classNames,
      id: idProp,
      onInput,
      ...textareaProps
    } = props;
    const id = useFieldId(idProp as string | undefined);
    const field = needsField(props);
    const control = fieldControlProps(id, props);
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const setRefs = useMergedRef(innerRef, ref);

    const resize = useCallback(() => {
      if (autosize && innerRef.current) {
        autosizeTextarea(innerRef.current, minRows, maxRows);
      }
    }, [autosize, minRows, maxRows]);

    // Re-measure on every render (the value may have changed from outside)
    // and whenever the width changes, since that re-wraps the text.
    useLayoutEffect(() => resize());
    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!autosize || !el || typeof ResizeObserver === 'undefined') {
        return;
      }
      let width = el.offsetWidth;
      const observer = new ResizeObserver(() => {
        if (el.offsetWidth !== width) {
          width = el.offsetWidth;
          resize();
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [autosize, resize]);

    const textarea = (
      <textarea
        {...textareaProps}
        {...control}
        ref={setRefs}
        rows={autosize ? minRows : (textareaProps.rows ?? minRows)}
        onInput={(e) => {
          resize();
          onInput?.(e);
        }}
        className={cn(
          'Textarea__input',
          !field && 'Textarea',
          INPUT_BASE_CLASSES,
          'leading-normal',
          TEXTAREA_SIZE_CLASSES[size],
          autosize ? 'resize-none' : 'resize-y',
          !field && className,
          classNames?.input
        )}
      />
    );

    if (!field) {
      return textarea;
    }
    return (
      <Field
        id={id}
        label={label}
        description={description}
        error={error}
        required={required}
        size={size}
        className={cn('Textarea', className)}
      >
        {textarea}
      </Field>
    );
  }
);

/**
 * Sets a textarea's height to fit its content, clamped to `minRows` and
 * `maxRows` lines, and only shows a scrollbar once it hits `maxRows`.
 */
function autosizeTextarea(
  el: HTMLTextAreaElement,
  minRows: number,
  maxRows: number | undefined
) {
  const style = window.getComputedStyle(el);
  const lineHeight =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const padding =
    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const border =
    parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const min = minRows * lineHeight + padding + border;
  const max = maxRows ? maxRows * lineHeight + padding + border : Infinity;

  // Collapse first, so `scrollHeight` measures the content, not the box.
  el.style.height = `${min}px`;
  const content = el.scrollHeight + border;
  const height = Math.min(Math.max(content, min), max);
  el.style.height = `${height}px`;
  el.style.overflowY = content > max ? 'auto' : 'hidden';
}
