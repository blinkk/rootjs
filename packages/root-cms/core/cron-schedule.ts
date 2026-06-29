/**
 * Utilities for evaluating standard cron expressions for data source
 * scheduling.
 *
 * Supports the standard 5-field cron format:
 *
 *   ┌───────────── minute (0 - 59)
 *   │ ┌───────────── hour (0 - 23)
 *   │ │ ┌───────────── day of month (1 - 31)
 *   │ │ │ ┌───────────── month (1 - 12)
 *   │ │ │ │ ┌───────────── day of week (0 - 6, where 0 and 7 are Sunday)
 *   │ │ │ │ │
 *   * * * * *
 *
 * Each field supports `*`, single values, ranges (`a-b`), lists (`a,b,c`),
 * steps (`* /n`, `a-b/n`), and combinations thereof. Expressions are evaluated
 * against a specific IANA timezone so that schedules like "every day at 7pm"
 * fire at the expected wall-clock time.
 */

const ONE_MINUTE_MS = 60 * 1000;

/**
 * The maximum amount of time to look back when determining whether a cron
 * schedule is due. This bounds the catch-up search for sources that haven't
 * synced in a long time (e.g. a monthly schedule that missed its window).
 */
const MAX_LOOKBACK_MS = 366 * 24 * 60 * 60 * 1000;

interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** Whether the day-of-month field was restricted (not `*`). */
  dayOfMonthRestricted: boolean;
  /** Whether the day-of-week field was restricted (not `*`). */
  dayOfWeekRestricted: boolean;
}

interface FieldRange {
  min: number;
  max: number;
}

const FIELD_RANGES: FieldRange[] = [
  {min: 0, max: 59}, // minute
  {min: 0, max: 23}, // hour
  {min: 1, max: 31}, // day of month
  {min: 1, max: 12}, // month
  {min: 0, max: 7}, // day of week (0 and 7 both mean Sunday)
];

/**
 * Parses a single cron field (e.g. `* /5`, `1-5`, `0,30`) into the set of
 * matching integer values.
 */
function parseField(field: string, range: FieldRange): Set<number> {
  const values = new Set<number>();
  const parts = field.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      throw new Error(`invalid cron field: "${field}"`);
    }

    let rangePart = trimmed;
    let step = 1;
    if (trimmed.includes('/')) {
      const [rangeStr, stepStr] = trimmed.split('/');
      rangePart = rangeStr;
      step = Number(stepStr);
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`invalid cron step: "${trimmed}"`);
      }
    }

    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = range.min;
      end = range.max;
    } else if (rangePart.includes('-')) {
      const [startStr, endStr] = rangePart.split('-');
      start = Number(startStr);
      end = Number(endStr);
    } else {
      start = Number(rangePart);
      end = start;
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < range.min ||
      end > range.max ||
      start > end
    ) {
      throw new Error(`invalid cron field: "${field}"`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }
  return values;
}

/**
 * Parses a standard 5-field cron expression. Throws if the expression is
 * malformed.
 */
export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `invalid cron expression: "${expression}" (expected 5 fields)`
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const parsedDayOfWeek = parseField(dayOfWeek, FIELD_RANGES[4]);
  // Normalize Sunday (7) to 0 so it can be matched against `getDay()` output.
  if (parsedDayOfWeek.has(7)) {
    parsedDayOfWeek.delete(7);
    parsedDayOfWeek.add(0);
  }

  return {
    minute: parseField(minute, FIELD_RANGES[0]),
    hour: parseField(hour, FIELD_RANGES[1]),
    dayOfMonth: parseField(dayOfMonth, FIELD_RANGES[2]),
    month: parseField(month, FIELD_RANGES[3]),
    dayOfWeek: parsedDayOfWeek,
    dayOfMonthRestricted: dayOfMonth.trim() !== '*',
    dayOfWeekRestricted: dayOfWeek.trim() !== '*',
  };
}

/**
 * Returns true if the given cron expression is syntactically valid.
 */
export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression);
    return true;
  } catch (err) {
    return false;
  }
}

interface ZonedFields {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
}

/**
 * Returns the wall-clock fields (minute, hour, day, month, day-of-week) for the
 * given instant in the given IANA timezone. Uses `Intl` so the result is
 * independent of the host machine's timezone.
 */
function getZonedFields(date: Date, timeZone: string): ZonedFields {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Some runtimes report midnight as hour "24" rather than "00".
  let hour = Number(parts.hour);
  if (hour === 24) {
    hour = 0;
  }
  const minute = Number(parts.minute);
  // Compute the day of week (0 = Sunday) from the zoned calendar date.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {minute, hour, dayOfMonth: day, month, dayOfWeek};
}

/**
 * Returns true if the given wall-clock fields match the parsed cron expression.
 */
function matchesCron(parsed: ParsedCron, fields: ZonedFields): boolean {
  if (!parsed.minute.has(fields.minute)) {
    return false;
  }
  if (!parsed.hour.has(fields.hour)) {
    return false;
  }
  if (!parsed.month.has(fields.month)) {
    return false;
  }

  // Standard cron day matching: when both day-of-month and day-of-week are
  // restricted, the entry matches if *either* matches. When only one is
  // restricted, that one must match.
  const domMatch = parsed.dayOfMonth.has(fields.dayOfMonth);
  const dowMatch = parsed.dayOfWeek.has(fields.dayOfWeek);
  if (parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted) {
    return domMatch || dowMatch;
  }
  if (parsed.dayOfMonthRestricted) {
    return domMatch;
  }
  if (parsed.dayOfWeekRestricted) {
    return dowMatch;
  }
  return true;
}

export interface IsCronDueOptions {
  /** Standard 5-field cron expression, e.g. "0 19 * * *". */
  expression: string;
  /** IANA timezone used to evaluate the expression. Defaults to "UTC". */
  timezone?: string;
  /** Timestamp (ms) of the last successful sync, or 0 if never synced. */
  lastSyncMs: number;
  /** Current time (ms). */
  now: number;
}

/**
 * Determines whether a cron-scheduled data source is due for sync.
 *
 * Uses catch-up semantics: the source is due if there is any scheduled minute
 * in the window `(lastSyncMs, now]` that matches the cron expression. This
 * ensures a missed cron tick (e.g. the scheduler was briefly down at the
 * scheduled minute) still triggers a sync on a later tick.
 *
 * When the source has never synced (`lastSyncMs <= 0`), only the current minute
 * is considered so that enabling a schedule does not trigger an unexpected
 * immediate backfill — the source will first sync at its next scheduled time.
 */
export function isCronDue(options: IsCronDueOptions): boolean {
  const {expression, now} = options;
  const timezone = options.timezone || 'UTC';
  const parsed = parseCronExpression(expression);

  let lastSyncMs = options.lastSyncMs;
  // Guard against future syncedAt values (e.g. from skewed clocks).
  if (lastSyncMs > now) {
    lastSyncMs = now;
  }

  // Align `now` down to the start of the current minute.
  const nowMinute = Math.floor(now / ONE_MINUTE_MS) * ONE_MINUTE_MS;

  let lowerBound: number;
  if (lastSyncMs > 0) {
    lowerBound = Math.max(lastSyncMs, now - MAX_LOOKBACK_MS);
  } else {
    // Never synced: only evaluate the current minute.
    lowerBound = nowMinute - ONE_MINUTE_MS;
  }

  for (let t = nowMinute; t > lowerBound; t -= ONE_MINUTE_MS) {
    if (matchesCron(parsed, getZonedFields(new Date(t), timezone))) {
      return true;
    }
  }
  return false;
}
