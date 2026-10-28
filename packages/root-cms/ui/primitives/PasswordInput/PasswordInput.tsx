import {IconEye, IconEyeOff} from '@tabler/icons-preact';
import {forwardRef} from 'preact/compat';
import {useState} from 'preact/hooks';
import {cn} from '../../utils/classes.js';
import {IconButton} from '../IconButton/IconButton.js';
import {TextInput, type TextInputProps} from '../TextInput/TextInput.js';

export type PasswordInputProps = Omit<TextInputProps, 'type' | 'rightSection'>;

/**
 * A password input with a button that shows or hides what's typed. Replaces
 * Mantine's `PasswordInput`. Takes the same props as `TextInput`.
 *
 * ```tsx
 * <PasswordInput
 *   label="New password"
 *   autoComplete="new-password"
 *   value={draft}
 *   onInput={(e) => setDraft(e.currentTarget.value)}
 *   error={error}
 * />
 * ```
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const {className, size = 'sm', disabled, ...inputProps} = props;
    const [visible, setVisible] = useState(false);
    return (
      <TextInput
        {...inputProps}
        ref={ref}
        size={size}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={cn('PasswordInput', className)}
        rightSection={
          <IconButton
            className="PasswordInput__toggle"
            label="Show password"
            size="xs"
            pressed={visible}
            disabled={disabled}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <IconEyeOff /> : <IconEye />}
          </IconButton>
        }
      />
    );
  }
);
