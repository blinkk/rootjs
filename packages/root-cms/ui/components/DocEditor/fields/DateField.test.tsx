import {render, screen, fireEvent} from '@testing-library/preact';
import {describe, it, vi, expect} from 'vitest';
import {DateField} from './DateField.js';

const useDraftDocValueMock = vi.fn();

vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: (key: string) => useDraftDocValueMock(key),
}));

describe('DateField', () => {
  it('does not crash with null value', () => {
    useDraftDocValueMock.mockReturnValue([null, vi.fn()]);
    render(<DateField field={{type: 'date', label: 'Date'}} deepKey="date" />);
  });

  it('shows error message for invalid date input', () => {
    useDraftDocValueMock.mockReturnValue([null, vi.fn()]);
    const {container} = render(
      <DateField field={{type: 'date', label: 'Date'}} deepKey="date" />
    );

    // Simulate invalid date input (e.g. user typing)
    const input = container.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;

    // Mock validity
    Object.defineProperty(input, 'validity', {
      value: {
        valid: false,
        badInput: true,
      },
      writable: true,
    });

    fireEvent.change(input, {target: {value: ''}});

    expect(screen.getByText('Invalid date')).not.toBeNull();
  });

  it('does not crash with object value', () => {
    // Simulate object value (e.g. Timestamp) erroneously stored
    useDraftDocValueMock.mockReturnValue([{seconds: 123}, vi.fn()]);

    // This might crash if we don't handle it
    render(<DateField field={{type: 'date', label: 'Date'}} deepKey="date" />);
  });
});
