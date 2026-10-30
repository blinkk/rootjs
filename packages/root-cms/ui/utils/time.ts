import type {Timestamp} from 'firebase/firestore';

/**
 * Converts a time unit to millis.
 */
export const TIME_UNITS = {
  year: 24 * 60 * 60 * 1000 * 365,
  month: (24 * 60 * 60 * 1000 * 365) / 12,
  week: 7 * 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
  second: 1000,
};

export function getTimeAgo(
  millis: number,
  options?: Intl.RelativeTimeFormatOptions
) {
  const elapsed = Math.abs(millis - new Date().getTime());
  if (elapsed < TIME_UNITS.second) {
    return 'just now';
  }

  const rtfOptions = options || {numeric: 'auto'};
  const rtf = new Intl.RelativeTimeFormat('en', rtfOptions);
  if (elapsed < TIME_UNITS.minute) {
    return rtf.format(Math.round(-elapsed / TIME_UNITS.second), 'second');
  }
  if (elapsed < TIME_UNITS.hour) {
    return rtf.format(Math.round(-elapsed / TIME_UNITS.minute), 'minute');
  }
  if (elapsed < TIME_UNITS.day) {
    return rtf.format(Math.round(-elapsed / TIME_UNITS.hour), 'hour');
  }
  if (elapsed < TIME_UNITS.week) {
    return rtf.format(Math.round(-elapsed / TIME_UNITS.day), 'day');
  }
  const d = new Date(millis);
  return d.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function timestamp(): number {
  return Math.floor(new Date().getTime());
}

/**
 * A Firestore timestamp, a serialized one (`{seconds, nanoseconds}` or
 * `{_seconds, _nanoseconds}`), a `Date`, or epoch millis.
 */
export type TimestampLike =
  | Timestamp
  | Date
  | number
  | {seconds: number; nanoseconds?: number}
  | {_seconds: number; _nanoseconds?: number};

/** Converts a timestamp-like value to epoch millis, or 0 if it isn't one. */
export function timestampToMillis(ts: unknown): number {
  if (typeof ts === 'number') {
    return ts;
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  const value = ts as any;
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }
  const seconds = value?.seconds ?? value?._seconds ?? 0;
  const nanos = value?.nanoseconds ?? value?._nanoseconds ?? 0;
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

/**
 * Formats a timestamp as a full local date and time, e.g. "Oct 26, 2026,
 * 1:30 PM". This is the format for date/time tooltips across the CMS.
 */
export function formatDateTime(ts: TimestampLike | unknown): string {
  return new Date(timestampToMillis(ts)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getLocalISOString() {
  const pad = (n: number) => (n < 10 ? '0' + n : n);

  const now = new Date();
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
