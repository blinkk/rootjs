import {Timestamp} from 'firebase/firestore';

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
 * Converts various timestamp formats to a Firestore Timestamp object.
 * Accepts: Timestamp, Date, number (milliseconds), or plain object with seconds.
 * Returns a valid Timestamp object or undefined if the input is invalid.
 */
export function toTimestamp(ts: any): Timestamp | undefined {
  if (!ts) {
    return undefined;
  }

  try {
    // Already a valid Timestamp with working methods.
    if (typeof ts.toMillis === 'function' && typeof ts.toDate === 'function') {
      // Verify it actually works.
      ts.toMillis();
      return ts as Timestamp;
    }

    // Plain object with seconds (Timestamp-like from Firestore).
    if (
      typeof ts === 'object' &&
      'seconds' in ts &&
      typeof ts.seconds === 'number'
    ) {
      const millis = ts.seconds * 1000;
      return Timestamp.fromMillis(millis);
    }

    // Number (assume milliseconds).
    if (typeof ts === 'number') {
      return Timestamp.fromMillis(ts);
    }

    // Date object.
    if (ts instanceof Date) {
      return Timestamp.fromDate(ts);
    }

    return undefined;
  } catch (error) {
    console.error('Invalid timestamp:', ts);
    console.error(error);
    return undefined;
  }
}

export function formatDateTime(ts: Timestamp) {
  const date = new Date(ts.toMillis());
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
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

/**
 * Formats a timestamp to a localized date string.
 * Accepts: Timestamp, Date, number (milliseconds), or plain object with seconds.
 * Returns a fallback string if the timestamp is invalid.
 */
export function formatTimestamp(
  timestamp: any,
  formatter: Intl.DateTimeFormat,
  fallback: string = 'Invalid date'
): string {
  try {
    // Handle undefined/null.
    if (!timestamp) {
      return fallback;
    }

    // If it's already a Date object.
    if (timestamp instanceof Date) {
      return formatter.format(timestamp);
    }

    // If it has a toDate method (Timestamp).
    if (typeof timestamp.toDate === 'function') {
      const date = timestamp.toDate();
      return formatter.format(date);
    }

    // If it has a toMillis method (Timestamp).
    if (typeof timestamp.toMillis === 'function') {
      const date = new Date(timestamp.toMillis());
      return formatter.format(date);
    }

    // If it's a number (assume milliseconds).
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return formatter.format(date);
    }

    // If it's an object with seconds (Timestamp-like).
    if (
      typeof timestamp === 'object' &&
      'seconds' in timestamp &&
      typeof timestamp.seconds === 'number'
    ) {
      const millis = timestamp.seconds * 1000;
      const date = new Date(millis);
      return formatter.format(date);
    }

    return fallback;
  } catch (error) {
    console.error('Error formatting timestamp:', timestamp);
    console.error(error);
    return fallback;
  }
}
