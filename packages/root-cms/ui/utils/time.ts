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
