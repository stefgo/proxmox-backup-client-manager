import { describe, expect, it } from 'vitest';
import { durationBetween, formatDuration, formatRelativeTime, parseTimestamp } from './time';

describe('parseTimestamp', () => {
    it('reads the SQLite format as UTC', () => {
        expect(parseTimestamp('2026-10-03 12:00:00')?.toISOString()).toBe('2026-10-03T12:00:00.000Z');
    });

    it('reads an ISO string, a number and a date as they are', () => {
        expect(parseTimestamp('2026-10-03T12:00:00Z')?.toISOString()).toBe('2026-10-03T12:00:00.000Z');
        expect(parseTimestamp(0)?.getTime()).toBe(0);
        const date = new Date(5);
        expect(parseTimestamp(date)?.getTime()).toBe(5);
    });

    it('has no date for nothing and for what does not parse', () => {
        expect(parseTimestamp(null)).toBeNull();
        expect(parseTimestamp(undefined)).toBeNull();
        expect(parseTimestamp('')).toBeNull();
        expect(parseTimestamp('yesterday')).toBeNull();
    });
});

describe('formatDuration', () => {
    it('names seconds alone below a minute', () => {
        expect(formatDuration(0)).toBe('0s');
        expect(formatDuration(900)).toBe('0s');
        expect(formatDuration(45_000)).toBe('45s');
    });

    it('names minutes and seconds below an hour', () => {
        expect(formatDuration(60_000)).toBe('1m 00s');
        expect(formatDuration(192_000)).toBe('3m 12s');
    });

    it('names hours and minutes from an hour on', () => {
        expect(formatDuration(3_600_000)).toBe('1h 00m');
        expect(formatDuration(3_600_000 + 4 * 60_000 + 59_000)).toBe('1h 04m');
        expect(formatDuration(30 * 3_600_000)).toBe('30h 00m');
    });
});

describe('durationBetween', () => {
    it('is the time from start to end, across both formats', () => {
        expect(durationBetween('2026-10-03 12:00:00', '2026-10-03T12:03:12Z')).toBe(192_000);
    });

    it('is nothing while the end is missing', () => {
        expect(durationBetween('2026-10-03 12:00:00', null)).toBeNull();
        expect(durationBetween('2026-10-03 12:00:00', undefined)).toBeNull();
    });

    it('is nothing for an end before its start', () => {
        expect(durationBetween('2026-10-03 12:00:00', '2026-10-03 11:59:59')).toBeNull();
    });

    it('is zero for a run that ended in the second it started', () => {
        expect(durationBetween('2026-10-03 12:00:00', '2026-10-03 12:00:00')).toBe(0);
    });
});

describe('formatRelativeTime', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const at = (ms: number) => formatRelativeTime(new Date(now.getTime() + ms), now);
    const MINUTE = 60_000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    it('counts nothing below a minute', () => {
        expect(at(0)).toBe('just now');
        expect(at(-59_999)).toBe('just now');
        expect(at(59_999)).toBe('in less than a minute');
    });

    it('names the past and the future in the largest unit that fits', () => {
        expect(at(-MINUTE)).toBe('1 minute ago');
        expect(at(-3 * MINUTE)).toBe('3 minutes ago');
        expect(at(5 * HOUR)).toBe('in 5 hours');
        expect(at(-12 * DAY)).toBe('12 days ago');
        expect(at(-60 * DAY)).toBe('2 months ago');
        expect(at(800 * DAY)).toBe('in 2 years');
    });

    it('rounds down, so a unit is never claimed before it is full', () => {
        expect(at(-(HOUR - 1))).toBe('59 minutes ago');
        expect(at(2 * HOUR - 1)).toBe('in 1 hour');
        expect(at(-(30 * DAY - 1))).toBe('29 days ago');
    });

    it('says a single day by its name', () => {
        expect(at(-DAY)).toBe('yesterday');
        expect(at(DAY)).toBe('tomorrow');
    });
});
