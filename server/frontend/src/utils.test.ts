import { describe, expect, it } from 'vitest';
import { formatDate, formatRelativeDate } from './utils';

describe('formatDate', () => {
    // Noon UTC is the same calendar day in every zone the tests may run in.
    const date = '2026-10-03T12:00:00Z';

    it('writes the date as the given locale does', () => {
        expect(formatDate(date, 'de-DE')).toMatch(/^03\.10\.2026, \d{2}:00$/);
        expect(formatDate(date, 'en-US')).toMatch(/^10\/03\/2026, \d{2}:00\s[AP]M$/);
    });

    it('says so when there is no date, or none that parses', () => {
        expect(formatDate(null)).toBe('Never');
        expect(formatDate('')).toBe('Never');
        expect(formatDate('yesterday')).toBe('Invalid Date');
    });
});

describe('formatRelativeDate', () => {
    const now = new Date('2026-10-03T12:00:00Z').getTime();

    it('reads a timestamp of the server as a distance', () => {
        expect(formatRelativeDate('2026-10-03 11:57:00', now)).toBe('3 minutes ago');
        expect(formatRelativeDate('2026-10-03T17:00:00Z', now)).toBe('in 5 hours');
    });

    it('says so when there is no date, or none that parses', () => {
        expect(formatRelativeDate(null, now)).toBe('Never');
        expect(formatRelativeDate('yesterday', now)).toBe('Invalid Date');
    });
});
