import {IconLock, IconLockOpen} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {
  hashPassword,
  isPasswordHash,
} from '../../../../../../shared/password.js';
import {Button} from '../../../../../primitives/Button/Button.js';
import {PasswordInput} from '../../../../../primitives/PasswordInput/PasswordInput.js';
import {cn} from '../../../../../utils/classes.js';
import {errorMessage} from '../../../../../utils/notifications.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

/**
 * Editor for a `password` field. The password typed into the input only lives
 * in component state; it is hashed in the browser and only the resulting
 * {@link schema.PasswordHash} is written to the draft doc.
 */
export function PasswordField(props: FieldProps) {
  const field = props.field as schema.PasswordField;
  const [value, setValue] = useDraftDocValue<schema.PasswordHash | null>(
    props.deepKey,
    null
  );
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface mismatched data (e.g. a plain string) instead of silently treating
  // it as a password. The FieldErrorBoundary shows an inline error.
  if (value !== null && value !== undefined && !isPasswordHash(value)) {
    throw new Error(
      'Expected a hashed password value but got something else. The stored ' +
        'data for this field may be corrupted. Fix it using "Edit JSON" or ' +
        'restore a previous version.'
    );
  }

  const hasPassword = isPasswordHash(value);
  const minLength = field.minLength ?? 1;
  const canSave = draft.length > 0 && !saving;

  function reset() {
    setDraft('');
    setError(null);
    setEditing(false);
  }

  async function save() {
    if (!canSave) {
      return;
    }
    // Only report a short password once the user tries to save it, otherwise
    // the error would show on the very first keystroke.
    if (draft.length < minLength) {
      setError(`Must be at least ${minLength} characters`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const hashed = await hashPassword(draft, {
        iterations: field.iterations,
      });
      setValue(hashed);
      reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    setValue(null);
    reset();
  }

  if (hasPassword && !editing) {
    return (
      <div className="PasswordField flex flex-col gap-2">
        <div className="PasswordField__status flex items-center gap-1.5 text-sm">
          <IconLock size={16} />
          <span className="PasswordField__status__label font-semibold">
            Password set
          </span>
          <span className="PasswordField__status__meta font-mono text-xs text-muted">
            {value!.algorithm}
          </span>
        </div>
        <div className="PasswordField__actions flex items-center gap-2">
          <Button onClick={() => setEditing(true)}>Change password</Button>
          <Button variant="danger-subtle" onClick={remove}>
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="PasswordField flex flex-col gap-2">
      <PasswordInput
        className="PasswordField__input"
        classNames={{input: 'rounded-none'}}
        aria-label={field.label || field.id}
        autoComplete="new-password"
        placeholder={field.placeholder || 'Enter a new password'}
        value={draft}
        error={error || undefined}
        disabled={saving}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
      />
      <div className="PasswordField__actions flex items-center gap-2">
        <Button
          className={cn(
            'PasswordField__save',
            saving && 'PasswordField__save--saving'
          )}
          variant="primary"
          icon={<IconLockOpen />}
          loading={saving}
          disabled={!canSave}
          onClick={save}
        >
          {hasPassword ? 'Update password' : 'Set password'}
        </Button>
        {hasPassword && (
          <Button variant="subtle" onClick={reset}>
            Cancel
          </Button>
        )}
      </div>
      <div className="PasswordField__help text-xs text-muted">
        The password is hashed before saving and cannot be viewed again.
      </div>
    </div>
  );
}
