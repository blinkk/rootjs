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
 * Returns a compact, precise "time ago" string, e.g. "4h 2m ago". Falls back
 * to a "mm/dd hh:mm" date string for timestamps older than a day.
 */
export function getPreciseTimeAgo(millis: number) {
  const elapsed = Math.abs(new Date().getTime() - millis);
  if (elapsed < TIME_UNITS.minute) {
    return 'just now';
  }
  if (elapsed < TIME_UNITS.hour) {
    const mins = Math.floor(elapsed / TIME_UNITS.minute);
    return `${mins}m ago`;
  }
  if (elapsed < TIME_UNITS.day) {
    const hours = Math.floor(elapsed / TIME_UNITS.hour);
    const mins = Math.floor((elapsed % TIME_UNITS.hour) / TIME_UNITS.minute);
    return mins ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  }
  const date = new Date(millis);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
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
