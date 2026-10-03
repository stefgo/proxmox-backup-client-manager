import { describe, expect, it } from 'vitest';
import { isAtEnd } from './logScroll';

describe('isAtEnd', () => {
    it('is at the end while everything fits', () => {
        expect(isAtEnd({ scrollTop: 0, scrollHeight: 120, clientHeight: 384 })).toBe(true);
        expect(isAtEnd({ scrollTop: 0, scrollHeight: 384, clientHeight: 384 })).toBe(true);
    });

    it('is at the end when scrolled all the way down', () => {
        expect(isAtEnd({ scrollTop: 616, scrollHeight: 1000, clientHeight: 384 })).toBe(true);
    });

    it('forgives less than a line, which is rounding and not reading', () => {
        expect(isAtEnd({ scrollTop: 600.5, scrollHeight: 1000, clientHeight: 384 })).toBe(true);
    });

    it('is not at the end once the operator scrolled up', () => {
        expect(isAtEnd({ scrollTop: 599, scrollHeight: 1000, clientHeight: 384 })).toBe(false);
        expect(isAtEnd({ scrollTop: 0, scrollHeight: 1000, clientHeight: 384 })).toBe(false);
    });
});
