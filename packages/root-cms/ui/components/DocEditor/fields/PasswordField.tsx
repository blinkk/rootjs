import './PasswordField.css';

import {Button, PasswordInput} from '@mantine/core';
import {IconLock, IconLockOpen} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {hashPassword, isPasswordHash} from '../../../../shared/password.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {joinClassNames} from '../../../utils/classes.js';
import {errorMessage} from '../../../utils/notifications.js';
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
  const tooShort = draft.length > 0 && draft.length < minLength;
  const canSave = draft.length >= minLength && !saving;

  function reset() {
    setDraft('');
    setError(null);
    setEditing(false);
  }

  async function save() {
    if (!canSave) {
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
      <div className="PasswordField">
        <div className="PasswordField__status">
          <IconLock size={16} />
          <span className="PasswordField__status__label">Password set</span>
          <span className="PasswordField__status__meta">
            {value!.algorithm}
          </span>
        </div>
        <div className="PasswordField__actions">
          <Button
            color="dark"
            size="xs"
            variant="default"
            onClick={() => setEditing(true)}
          >
            Change password
          </Button>
          <Button color="red" size="xs" variant="subtle" onClick={remove}>
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="PasswordField">
      <PasswordInput
        className="PasswordField__input"
        size="xs"
        radius={0}
        autoComplete="new-password"
        placeholder={field.placeholder || 'Enter a new password'}
        value={draft}
        error={tooShort ? `Must be at least ${minLength} characters` : error}
        disabled={saving}
        onChange={(e: any) => setDraft(e.currentTarget.value)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
      />
      <div className="PasswordField__actions">
        <Button
          className={joinClassNames(
            'PasswordField__save',
            saving && 'PasswordField__save--saving'
          )}
          color="dark"
          size="xs"
          leftIcon={<IconLockOpen size={14} />}
          loading={saving}
          disabled={!canSave}
          onClick={save}
        >
          {hasPassword ? 'Update password' : 'Set password'}
        </Button>
        {hasPassword && (
          <Button size="xs" variant="subtle" color="gray" onClick={reset}>
            Cancel
          </Button>
        )}
      </div>
      <div className="PasswordField__help">
        The password is hashed before saving and cannot be viewed again.
      </div>
    </div>
  );
}
