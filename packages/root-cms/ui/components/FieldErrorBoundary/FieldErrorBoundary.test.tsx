import {cleanup, render, screen} from '@testing-library/preact';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {FieldErrorBoundary} from './FieldErrorBoundary.js';

/**
 * Test fixture: a component that throws while rendering. This simulates a
 * field whose stored value has an unexpected type (e.g. the `e.split is not a
 * function` crash that takes down the whole doc editor).
 */
function ThrowingField(props: {message?: string}) {
  throw new Error(props.message || 'field render failed');

  return null;
}

/** Test fixture: a field that renders normally. */
function HealthyField() {
  return <div>healthy field</div>;
}

describe('FieldErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('renders children when no error is thrown', () => {
    render(
      <FieldErrorBoundary deepKey="meta.title">
        <HealthyField />
      </FieldErrorBoundary>
    );
    expect(screen.getByText('healthy field')).toBeTruthy();
  });

  test('renders a fallback message when a child throws', () => {
    // Suppress the expected error log from the boundary.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <FieldErrorBoundary deepKey="meta.title">
        <ThrowingField message="e.split is not a function" />
      </FieldErrorBoundary>
    );

    expect(screen.getByText('This field failed to render.')).toBeTruthy();
    expect(screen.getByText('e.split is not a function')).toBeTruthy();
    expect(screen.queryByText('healthy field')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  test('includes the deepKey in the logged error', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <FieldErrorBoundary deepKey="fields.0.body">
        <ThrowingField />
      </FieldErrorBoundary>
    );

    const loggedMessages = consoleError.mock.calls.map((call) =>
      String(call[0])
    );
    expect(loggedMessages.some((msg) => msg.includes('fields.0.body'))).toBe(
      true
    );
  });
});
