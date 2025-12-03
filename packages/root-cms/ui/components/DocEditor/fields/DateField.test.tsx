import {render, screen, cleanup} from '@testing-library/preact';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {DateField} from './DateField.js';

const useDraftDocValueMock = vi.fn();

vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: (key: string) => useDraftDocValueMock(key),
}));

describe('DateField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly', () => {
    useDraftDocValueMock.mockReturnValue([null, vi.fn()]);
    const {container} = render(
      <DateField field={{type: 'date', label: 'Date'}} deepKey="date" />
    );

    const input = container.querySelector('input[type="date"]');
    expect(input).not.toBeNull();
    expect(screen.queryByText(/timezone:/)).toBeNull();
  });
});
