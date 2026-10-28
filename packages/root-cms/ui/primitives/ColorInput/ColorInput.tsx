import {IconColorPicker} from '@tabler/icons-preact';
import {forwardRef} from 'preact/compat';
import {useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {TextInput, type TextInputProps} from '../TextInput/TextInput.js';

interface ColorInputOwnProps {
  /** The color as `#rrggbb`. Leave unset (and use `defaultValue`) for uncontrolled. */
  value?: string;
  /** The initial color, when uncontrolled. */
  defaultValue?: string;
  /** Called with the new color as it's typed, picked, or chosen from a swatch. */
  onValueChange?: (value: string) => void;
  /** Preset colors (`#rrggbb`), shown as buttons beneath the input. */
  swatches?: string[];
}

export type ColorInputProps = ColorInputOwnProps &
  Omit<TextInputProps, keyof ColorInputOwnProps | 'type' | 'leftSection'>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * A hex color input: a text field with a preview swatch, the browser's
 * color picker, and optional preset swatches. Replaces Mantine's
 * `ColorInput` (hex format only). Works in forms via `name`, like a text
 * input.
 *
 * ```tsx
 * <ColorInput
 *   name="backgroundColor"
 *   label="Background color"
 *   defaultValue="#868e96"
 *   swatches={['#25262b', '#868e96', '#fa5252']}
 * />
 * ```
 */
export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  (props, ref) => {
    const {
      value,
      defaultValue,
      onValueChange,
      swatches,
      className,
      size = 'sm',
      disabled,
      readOnly,
      onInput,
      ...inputProps
    } = props;
    const [innerValue, setInnerValue] = useState(defaultValue ?? '');
    const current = value ?? innerValue;
    const valid = HEX_COLOR.test(current);
    const inactive = Boolean(disabled) || Boolean(readOnly);

    function update(next: string) {
      if (value === undefined) {
        setInnerValue(next);
      }
      onValueChange?.(next);
    }

    const picker = (
      <label
        className={cn(
          'ColorInput__picker relative flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-fg',
          'has-focus-visible:outline-2 has-focus-visible:outline-focus',
          'pointer-coarse:after:absolute pointer-coarse:after:-inset-2',
          inactive && 'pointer-events-none opacity-50'
        )}
      >
        <IconColorPicker className="size-4" aria-hidden="true" />
        <input
          type="color"
          className="ColorInput__native sr-only"
          aria-label="Pick a color"
          value={valid ? current.toLowerCase() : '#000000'}
          disabled={inactive}
          tabIndex={inactive ? -1 : undefined}
          onInput={(e) => update(e.currentTarget.value)}
        />
      </label>
    );

    const input = (
      <TextInput
        {...inputProps}
        ref={ref}
        size={size}
        disabled={disabled}
        readOnly={readOnly}
        value={current}
        spellcheck={false}
        autoComplete="off"
        className={swatches ? undefined : cn('ColorInput', className)}
        inputClassName="ColorInput__input font-mono"
        onInput={(e) => {
          update(e.currentTarget.value);
          onInput?.(e);
        }}
        leftSection={
          <span
            className={cn(
              'ColorInput__preview rounded-full border border-border-strong',
              size === 'xs' ? 'size-3' : 'size-4'
            )}
            style={valid ? {backgroundColor: current} : undefined}
          />
        }
        rightSection={picker}
      />
    );

    if (!swatches?.length) {
      return input;
    }
    return (
      <div className={cn('ColorInput flex min-w-0 flex-col gap-2', className)}>
        {input}
        <ColorSwatches
          colors={swatches}
          value={current}
          disabled={inactive}
          onSelect={update}
        />
      </div>
    );
  }
);

/** Props for `ColorSwatches`. */
export interface ColorSwatchesProps {
  /** The colors to offer (`#rrggbb`). */
  colors: string[];
  /** The selected color, marked as pressed. */
  value?: string;
  /** Called with the clicked color. */
  onSelect: (color: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A row of preset color buttons. `ColorInput` renders one beneath the input
 * when given `swatches`.
 */
export function ColorSwatches(props: ColorSwatchesProps) {
  return (
    <div
      className={cn('ColorSwatches flex flex-wrap gap-1.5', props.className)}
      role="group"
      aria-label="Preset colors"
    >
      {props.colors.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            'ColorSwatches__swatch relative m-0 size-5 cursor-pointer appearance-none rounded-sm border border-border-strong p-0',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            'aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-strong',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'pointer-coarse:size-8'
          )}
          style={{backgroundColor: color}}
          aria-label={color}
          aria-pressed={props.value?.toLowerCase() === color.toLowerCase()}
          disabled={props.disabled}
          onClick={() => props.onSelect(color)}
        />
      ))}
    </div>
  );
}
