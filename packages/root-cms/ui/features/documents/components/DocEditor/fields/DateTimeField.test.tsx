import {render, fireEvent, screen, cleanup} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {DateTimeField} from './DateTimeField.js';

const useDraftDocValueMock = vi.fn();

vi.mock('../../../useDraftDoc.js', () => ({
  useDraftDocValue: (key: string) => useDraftDocValueMock(key),
}));

/** Returns the timezone select's input, or null when it isn't rendered. */
function queryTimezoneSelect() {
  return screen.queryByRole('combobox', {
    name: 'Timezone',
  }) as HTMLInputElement | null;
}

describe('DateTimeField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders with default timezone', () => {
    useDraftDocValueMock.mockReturnValue([null, vi.fn()]);
    render(
      <DateTimeField field={{type: 'datetime', label: 'Date'}} deepKey="date" />
    );

    const select = queryTimezoneSelect()!;
    expect(select).not.toBeNull();

    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(select.value).toBe(systemTimezone);
  });

  it('renders with fixed timezone', () => {
    useDraftDocValueMock.mockReturnValue([null, vi.fn()]);
    render(
      <DateTimeField
        field={{type: 'datetime', label: 'Date', timezone: 'Asia/Tokyo'}}
        deepKey="date"
      />
    );

    expect(queryTimezoneSelect()).toBeNull();
    expect(screen.getByText('timezone: Asia/Tokyo')).not.toBeNull();
  });

  it('updates value correctly when timezone is UTC', () => {
    const setValue = vi.fn();
    useDraftDocValueMock.mockReturnValue([null, setValue]);
    const {container} = render(
      <DateTimeField
        field={{type: 'datetime', label: 'Date', timezone: 'UTC'}}
        deepKey="date"
      />
    );

    const input = container.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {target: {value: '2023-10-27T12:00'}});

    // 2023-10-27T12:00 UTC -> Timestamp
    expect(setValue).toHaveBeenCalled();
    const timestamp = setValue.mock.calls[0][0] as Timestamp;
    expect(timestamp.toDate().toISOString()).toBe('2023-10-27T12:00:00.000Z');
  });

  it('updates value correctly when timezone is Asia/Tokyo', () => {
    const setValue = vi.fn();
    useDraftDocValueMock.mockReturnValue([null, setValue]);
    const {container} = render(
      <DateTimeField
        field={{type: 'datetime', label: 'Date', timezone: 'Asia/Tokyo'}}
        deepKey="date"
      />
    );

    const input = container.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    // User enters 12:00 (Tokyo time)
    fireEvent.change(input, {target: {value: '2023-10-27T12:00'}});

    // 12:00 Tokyo is 03:00 UTC
    expect(setValue).toHaveBeenCalled();
    const timestamp = setValue.mock.calls[0][0] as Timestamp;
    expect(timestamp.toDate().toISOString()).toBe('2023-10-27T03:00:00.000Z');
  });

  it('displays value correctly in selected timezone', () => {
    // 2023-10-27T03:00:00Z -> 12:00 Tokyo
    const timestamp = Timestamp.fromDate(new Date('2023-10-27T03:00:00Z'));
    useDraftDocValueMock.mockReturnValue([timestamp, vi.fn()]);

    const {container} = render(
      <DateTimeField
        field={{type: 'datetime', label: 'Date', timezone: 'Asia/Tokyo'}}
        deepKey="date"
      />
    );
    const input = container.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input.value).toBe('2023-10-27T12:00');
  });

  it('reads timezone from metadata if available', () => {
    useDraftDocValueMock.mockImplementation((key: string) => {
      if (key === 'date') {
        return [null, vi.fn()];
      }
      if (key === '@date.timezone') {
        return ['Europe/London', vi.fn()];
      }
      return [null, vi.fn()];
    });

    render(
      <DateTimeField field={{type: 'datetime', label: 'Date'}} deepKey="date" />
    );

    expect(queryTimezoneSelect()!.value).toBe('Europe/London');
  });

  it('updates metadata when timezone changes', () => {
    const setStoredTimezone = vi.fn();
    useDraftDocValueMock.mockImplementation((key: string) => {
      if (key === 'date') {
        return [null, vi.fn()];
      }
      if (key === '@date.timezone') {
        return [null, setStoredTimezone];
      }
      return [null, vi.fn()];
    });

    render(
      <DateTimeField field={{type: 'datetime', label: 'Date'}} deepKey="date" />
    );

    const select = queryTimezoneSelect()!;
    select.focus();
    fireEvent.input(select, {target: {value: 'America/New_York'}});
    fireEvent.keyDown(select, {key: 'Enter'});

    expect(setStoredTimezone).toHaveBeenCalledWith('America/New_York');
  });

  it('field config timezone takes precedence over metadata', () => {
    useDraftDocValueMock.mockImplementation((key: string) => {
      if (key === 'date') {
        return [null, vi.fn()];
      }
      if (key === '@date.timezone') {
        return ['Europe/London', vi.fn()];
      }
      return [null, vi.fn()];
    });

    render(
      <DateTimeField
        field={{type: 'datetime', label: 'Date', timezone: 'Asia/Tokyo'}}
        deepKey="date"
      />
    );

    expect(queryTimezoneSelect()).toBeNull();
    expect(screen.getByText('timezone: Asia/Tokyo')).not.toBeNull();
  });
});
