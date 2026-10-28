import type {ComponentChildren} from 'preact';
import {forwardRef} from 'preact/compat';
import {useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {Textarea, type TextareaProps} from '../Textarea/Textarea.js';

interface JsonInputOwnProps {
  /** The JSON text. Leave unset (and use `defaultValue`) for uncontrolled. */
  value?: string;
  /** The initial JSON text, when uncontrolled. */
  defaultValue?: string;
  /**
   * Called with the new text as the user types, and with the formatted text
   * when `formatOnBlur` reformats it.
   */
  onValueChange?: (value: string) => void;
  /** Pretty-prints valid JSON (2-space indent) when the input loses focus. */
  formatOnBlur?: boolean;
  /**
   * The message shown when the text isn't valid JSON, checked on blur.
   * Default "Invalid JSON.". An `error` prop takes precedence.
   */
  validationError?: ComponentChildren;
}

export type JsonInputProps = JsonInputOwnProps &
  Omit<TextareaProps, keyof JsonInputOwnProps>;

/**
 * A monospace textarea for JSON that checks the text on blur, and can
 * reformat it. Replaces Mantine's `JsonInput`. Takes the same props as
 * `Textarea` (`autosize`, `minRows`, `maxRows`, `label`, …). Empty text
 * counts as valid.
 *
 * ```tsx
 * <JsonInput
 *   label="Data"
 *   formatOnBlur
 *   autosize
 *   minRows={4}
 *   maxRows={25}
 *   value={json}
 *   onValueChange={setJson}
 * />
 * ```
 */
export const JsonInput = forwardRef<HTMLTextAreaElement, JsonInputProps>(
  (props, ref) => {
    const {
      value,
      defaultValue,
      onValueChange,
      formatOnBlur = false,
      validationError = 'Invalid JSON.',
      error,
      className,
      classNames,
      onInput,
      onBlur,
      onFocus,
      ...textareaProps
    } = props;
    const [innerValue, setInnerValue] = useState(defaultValue ?? '');
    const [invalid, setInvalid] = useState(false);
    const current = value ?? innerValue;

    function update(next: string) {
      if (value === undefined) {
        setInnerValue(next);
      }
      onValueChange?.(next);
    }

    return (
      <Textarea
        {...textareaProps}
        ref={ref}
        value={current}
        spellcheck={false}
        autoComplete="off"
        error={error ?? (invalid ? validationError : undefined)}
        className={cn('JsonInput', className)}
        classNames={{
          ...classNames,
          input: cn('JsonInput__input font-mono', classNames?.input),
        }}
        onInput={(e) => {
          update(e.currentTarget.value);
          onInput?.(e);
        }}
        onFocus={(e) => {
          setInvalid(false);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          const text = e.currentTarget.value;
          const result = parseJson(text);
          setInvalid(!result.ok);
          if (result.ok && formatOnBlur && text.trim()) {
            const formatted = JSON.stringify(result.value, null, 2);
            if (formatted !== text) {
              update(formatted);
            }
          }
          onBlur?.(e);
        }}
      />
    );
  }
);

function parseJson(text: string): {ok: true; value: unknown} | {ok: false} {
  if (!text.trim()) {
    return {ok: true, value: undefined};
  }
  try {
    return {ok: true, value: JSON.parse(text)};
  } catch {
    return {ok: false};
  }
}
