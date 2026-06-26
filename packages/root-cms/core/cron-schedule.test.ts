import {describe, it, expect} from 'vitest';
import {
  isCronDue,
  isValidCronExpression,
  parseCronExpression,
} from './cron-schedule.js';

const MINUTE = 60 * 1000;

/** Returns the epoch ms for a wall-clock time in the given timezone. */
function ms(iso: string): number {
  return new Date(iso).getTime();
}

describe('parseCronExpression', () => {
  it('parses a daily expression', () => {
    const parsed = parseCronExpression('0 19 * * *');
    expect([...parsed.minute]).toEqual([0]);
    expect([...parsed.hour]).toEqual([19]);
    expect(parsed.dayOfMonthRestricted).toBe(false);
    expect(parsed.dayOfWeekRestricted).toBe(false);
  });

  it('parses ranges, lists, and steps', () => {
    const parsed = parseCronExpression('0,30 9-17 * * 1-5');
    expect([...parsed.minute]).toEqual([0, 30]);
    expect([...parsed.hour]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...parsed.dayOfWeek]).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses step intervals', () => {
    const parsed = parseCronExpression('*/15 * * * *');
    expect([...parsed.minute]).toEqual([0, 15, 30, 45]);
  });

  it('normalizes Sunday (7) to 0', () => {
    const parsed = parseCronExpression('0 0 * * 7');
    expect([...parsed.dayOfWeek]).toEqual([0]);
  });

  it('throws on wrong field count', () => {
    expect(() => parseCronExpression('0 19 * *')).toThrow();
    expect(() => parseCronExpression('0 19 * * * *')).toThrow();
  });

  it('throws on out-of-range values', () => {
    expect(() => parseCronExpression('99 * * * *')).toThrow();
    expect(() => parseCronExpression('0 25 * * *')).toThrow();
  });
});

describe('isValidCronExpression', () => {
  it('accepts valid expressions', () => {
    expect(isValidCronExpression('0 19 * * *')).toBe(true);
    expect(isValidCronExpression('0 17 * * 5')).toBe(true);
  });

  it('rejects invalid expressions', () => {
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('not a cron')).toBe(false);
    expect(isValidCronExpression('0 19 * *')).toBe(false);
  });
});

describe('isCronDue', () => {
  const tz = 'America/New_York';

  it('fires "every day at 7pm" at the scheduled minute', () => {
    // 2026-06-26 19:00 in New York.
    const now = ms('2026-06-26T19:00:30-04:00');
    const lastSyncMs = ms('2026-06-26T12:00:00-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs, now})
    ).toBe(true);
  });

  it('does not fire before the scheduled minute', () => {
    const now = ms('2026-06-26T18:30:00-04:00');
    const lastSyncMs = ms('2026-06-26T12:00:00-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs, now})
    ).toBe(false);
  });

  it('does not fire twice within the same scheduled window', () => {
    const now = ms('2026-06-26T19:05:00-04:00');
    // Already synced at 19:00 today.
    const lastSyncMs = ms('2026-06-26T19:00:10-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs, now})
    ).toBe(false);
  });

  it('catches up a missed scheduled minute', () => {
    // Tick runs at 19:05 but the 19:00 tick was missed.
    const now = ms('2026-06-26T19:05:00-04:00');
    const lastSyncMs = ms('2026-06-25T19:00:10-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs, now})
    ).toBe(true);
  });

  it('fires "weekly on friday at 5pm"', () => {
    // 2026-06-26 is a Friday.
    const friday = ms('2026-06-26T17:00:20-04:00');
    const lastSyncMs = ms('2026-06-19T17:00:00-04:00');
    expect(
      isCronDue({expression: '0 17 * * 5', timezone: tz, lastSyncMs: lastSyncMs, now: friday})
    ).toBe(true);
  });

  it('does not fire weekly schedule on the wrong day', () => {
    // 2026-06-25 is a Thursday.
    const thursday = ms('2026-06-25T17:00:20-04:00');
    const lastSyncMs = ms('2026-06-19T17:00:00-04:00');
    expect(
      isCronDue({expression: '0 17 * * 5', timezone: tz, lastSyncMs, now: thursday})
    ).toBe(false);
  });

  it('only checks the current minute when never synced', () => {
    // Never synced + not currently the scheduled minute => not due, no backfill.
    const notScheduled = ms('2026-06-26T15:00:00-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs: 0, now: notScheduled})
    ).toBe(false);

    // Never synced + currently the scheduled minute => due.
    const scheduled = ms('2026-06-26T19:00:00-04:00');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs: 0, now: scheduled})
    ).toBe(true);
  });

  it('respects the timezone', () => {
    // 0 19 * * * in New York should NOT fire when it is 19:00 UTC (which is
    // 15:00 in New York).
    const now = ms('2026-06-26T19:00:00Z');
    const lastSyncMs = ms('2026-06-26T00:00:00Z');
    expect(
      isCronDue({expression: '0 19 * * *', timezone: tz, lastSyncMs, now})
    ).toBe(false);
  });

  it('defaults to UTC when no timezone is given', () => {
    const now = ms('2026-06-26T19:00:00Z');
    const lastSyncMs = ms('2026-06-26T00:00:00Z');
    expect(isCronDue({expression: '0 19 * * *', lastSyncMs, now})).toBe(true);
  });

  it('supports interval-style step expressions', () => {
    const now = ms('2026-06-26T19:15:00Z');
    const lastSyncMs = now - 10 * MINUTE;
    expect(isCronDue({expression: '*/15 * * * *', lastSyncMs, now})).toBe(true);
  });

  it('throws on an invalid expression', () => {
    expect(() =>
      isCronDue({expression: 'bogus', lastSyncMs: 0, now: Date.now()})
    ).toThrow();
  });
});
