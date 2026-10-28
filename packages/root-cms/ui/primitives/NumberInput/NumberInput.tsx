import './NumberInput.css';

import {IconChevronDown, IconChevronUp} from '@tabler/icons-preact';
import type {JSX} from 'preact';
import {forwardRef} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useMergedRef} from '../../hooks/useMergedRef.js';
import {cn} from '../../utils/classes.js';
import {type InputChromeProps, TextInput} from '../TextInput/TextInput.js';

interface NumberInputOwnProps extends Omit<InputChromeProps, 'rightSection'> {
  /** The number, or `undefined` when the input is empty. */
  value?: number;
  /** Called with the new number (`undefined` when cleared) as the user types. */
  onValueChange?: (value: number | undefined) => void;
  /** Hides the increment and decrement buttons. */
  hideControls?: boolean;
}

export type NumberInputProps = NumberInputOwnProps &
  Omit<
    JSX.InputHTMLAttributes<HTMLInputElement>,
    keyof NumberInputOwnProps | keyof InputChromeProps | 'type' | 'defaultValue'
  >;

/**
 * A number input, with increment and decrement buttons. Replaces Mantine's
 * `NumberInput`. It's a native `type="number"` input, so `min`, `max` and
 * `step` work as usual, and arrow keys step the value. The buttons are
 * hidden on touch screens, which show a number keypad instead.
 *
 * ```tsx
 * <NumberInput
 *   label="Interval"
 *   min={1}
 *   value={interval}
 *   onValueChange={(n) => setInterval(n ?? 1)}
 * />
 * ```
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (props, ref) => {
    const {
      value,
      onValueChange,
      hideControls = false,
      size = 'sm',
      className,
      classNames,
      onInput,
      disabled,
      readOnly,
      ...inputProps
    } = props;
    const innerRef = useRef<HTMLInputElement>(null);
    const setRefs = useMergedRef(innerRef, ref);

    // The text as typed, so partial input like "-" or "1." isn't replaced
    // by the parsed number on every keystroke.
    const [draft, setDraft] = useState(formatNumber(value));
    useEffect(() => {
      if (parseNumber(draft) !== value) {
        setDraft(formatNumber(value));
      }
      // Only resync when the value changes from outside, not on every edit.
    }, [value]);

    function commit(text: string) {
      setDraft(text);
      const next = parseNumber(text);
      if (next !== value) {
        onValueChange?.(next);
      }
    }

    function step(direction: 1 | -1) {
      const el = innerRef.current;
      if (!el || disabled || readOnly) {
        return;
      }
      if (direction === 1) {
        el.stepUp();
      } else {
        el.stepDown();
      }
      commit(el.value);
    }

    const showControls = !hideControls && !disabled && !readOnly;
    const controls = showControls && (
      <span className="NumberInput__controls flex h-full w-full flex-col py-px pr-px pointer-coarse:hidden">
        <StepButton label="Increment" onStep={() => step(1)}>
          <IconChevronUp />
        </StepButton>
        <StepButton label="Decrement" onStep={() => step(-1)}>
          <IconChevronDown />
        </StepButton>
      </span>
    );

    return (
      <TextInput
        {...inputProps}
        ref={setRefs}
        type="number"
        inputMode="decimal"
        size={size}
        disabled={disabled}
        readOnly={readOnly}
        value={draft}
        onInput={(e) => {
          commit(e.currentTarget.value);
          onInput?.(e);
        }}
        rightSection={controls || undefined}
        className={cn('NumberInput', className)}
        classNames={{
          ...classNames,
          input: cn('NumberInput__input', classNames?.input),
        }}
      />
    );
  }
);

/**
 * One of the stepper buttons. Out of the tab order (arrow keys do the same
 * from the input), and doesn't take focus from the input when clicked.
 */
function StepButton(props: {
  label: string;
  onStep: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={props.label}
      className="NumberInput__step m-0 flex min-h-0 flex-1 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-fg *:size-3"
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onStep}
    >
      {props.children}
    </button>
  );
}

function formatNumber(value: number | undefined) {
  return value === undefined || Number.isNaN(value) ? '' : String(value);
}

function parseNumber(text: string): number | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const num = Number(text);
  return Number.isNaN(num) ? undefined : num;
}
