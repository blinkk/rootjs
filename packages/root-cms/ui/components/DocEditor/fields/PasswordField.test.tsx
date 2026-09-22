import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/preact';
import {afterEach, describe, expect, test, vi} from 'vitest';
import * as schema from '../../../../core/schema.js';
import {FieldErrorBoundary} from '../../FieldErrorBoundary/FieldErrorBoundary.js';
import {FieldProps} from './FieldProps.js';

// Mock Mantine inputs. The real components require a MantineProvider context
// that isn't available under @preact/compat in jsdom.
vi.mock('@mantine/core', () => ({
  PasswordInput: ({value, onChange, error, placeholder}: any) => (
    <div>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onInput={onChange}
      />
      {error && <div>{error}</div>}
    </div>
  ),
  Button: ({children, onClick, disabled}: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// Mock the draft doc so the field renders without the full controller.
let mockValue: any = null;
const setValueMock = vi.fn();
vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: () => [mockValue, setValueMock] as const,
}));

// Mock hashing so the test doesn't run 600k PBKDF2 iterations.
const hashPasswordMock = vi.fn(async (password: string, options?: any) => ({
  algorithm: 'pbkdf2-sha256',
  iterations: options?.iterations ?? 600000,
  salt: 'c2FsdA==',
  hash: `hashed:${password}`,
}));
vi.mock('../../../../shared/password.js', async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    hashPassword: (password: string, options?: any) =>
      hashPasswordMock(password, options),
  };
});

// Import after mocks are registered.
const {PasswordField} = await import('./PasswordField.js');

const STORED: schema.PasswordHash = {
  algorithm: 'pbkdf2-sha256',
  iterations: 600000,
  salt: 'c2FsdA==',
  hash: 'aGFzaA==',
};

function renderField(value: any, field: Partial<schema.PasswordField> = {}) {
  mockValue = value;
  const props: FieldProps = {
    field: {type: 'password', id: 'password', ...field},
    deepKey: 'fields.password',
  };
  return render(
    <FieldErrorBoundary deepKey={props.deepKey}>
      <PasswordField {...props} />
    </FieldErrorBoundary>
  );
}

describe('PasswordField', () => {
  afterEach(() => {
    cleanup();
    setValueMock.mockClear();
    hashPasswordMock.mockClear();
  });

  test('renders an input when no password is set', () => {
    renderField(null);
    expect(screen.getByPlaceholderText('Enter a new password')).not.toBeNull();
    expect(screen.getByText('Set password')).not.toBeNull();
  });

  test('renders a status row when a password is set', () => {
    renderField(STORED);
    expect(screen.getByText('Password set')).not.toBeNull();
    expect(screen.getByText('Change password')).not.toBeNull();
    expect(screen.queryByPlaceholderText('Enter a new password')).toBeNull();
  });

  test('hashes the password and stores only the hash', async () => {
    renderField(null, {iterations: 1000});
    const input = screen.getByPlaceholderText('Enter a new password');
    fireEvent.input(input, {target: {value: 'hunter2'}});
    fireEvent.click(screen.getByText('Set password'));
    await waitFor(() => expect(setValueMock).toHaveBeenCalledTimes(1));
    expect(hashPasswordMock).toHaveBeenCalledWith('hunter2', {
      iterations: 1000,
    });
    const stored = setValueMock.mock.calls[0][0];
    expect(stored.algorithm).toBe('pbkdf2-sha256');
    expect(stored.iterations).toBe(1000);
    expect(JSON.stringify(stored)).not.toContain('"hunter2"');
  });

  test('only reports a short password when saving', async () => {
    renderField(null, {minLength: 8});
    const input = screen.getByPlaceholderText('Enter a new password');
    fireEvent.input(input, {target: {value: 'short'}});
    // No error while typing.
    expect(screen.queryByText('Must be at least 8 characters')).toBeNull();
    fireEvent.click(screen.getByText('Set password'));
    expect(screen.getByText('Must be at least 8 characters')).not.toBeNull();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(setValueMock).not.toHaveBeenCalled();
    // Typing again clears the error, and a long enough password saves.
    fireEvent.input(input, {target: {value: 'long-enough'}});
    expect(screen.queryByText('Must be at least 8 characters')).toBeNull();
    fireEvent.click(screen.getByText('Set password'));
    await waitFor(() => expect(setValueMock).toHaveBeenCalledTimes(1));
  });

  test('removes the stored password', () => {
    renderField(STORED);
    fireEvent.click(screen.getByText('Remove'));
    expect(setValueMock).toHaveBeenCalledWith(null);
  });

  test('can change an existing password', async () => {
    renderField(STORED);
    fireEvent.click(screen.getByText('Change password'));
    const input = screen.getByPlaceholderText('Enter a new password');
    fireEvent.input(input, {target: {value: 'new-secret'}});
    fireEvent.click(screen.getByText('Update password'));
    await waitFor(() => expect(setValueMock).toHaveBeenCalledTimes(1));
    expect(setValueMock.mock.calls[0][0].hash).toBe('hashed:new-secret');
  });

  test('shows an inline error for a plain string value', () => {
    renderField('hunter2');
    expect(screen.getByText('This field failed to render.')).not.toBeNull();
  });
});
