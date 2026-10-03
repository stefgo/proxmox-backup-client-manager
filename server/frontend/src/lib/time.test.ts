import { describe, expect, it } from 'vitest';
import { durationBetween, formatDuration, parseTimestamp } from './time';

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
