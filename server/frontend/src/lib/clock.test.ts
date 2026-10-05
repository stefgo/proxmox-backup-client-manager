import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClock } from './clock';

const TICK = 60_000;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('createClock', () => {
    it('runs no timer while nobody reads it', () => {
        createClock(TICK);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps one timer for every subscriber and tells all of them on a tick', () => {
        const clock = createClock(TICK);
        const first = vi.fn();
        const second = vi.fn();
        clock.subscribe(first);
        clock.subscribe(second);
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(TICK);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('stands still between two ticks and moves on with one', () => {
        const clock = createClock(TICK);
        clock.subscribe(() => {});
        const start = clock.getSnapshot();

        vi.advanceTimersByTime(TICK - 1);
        expect(clock.getSnapshot()).toBe(start);

        vi.advanceTimersByTime(1);
        expect(clock.getSnapshot()).toBe(start + TICK);
    });

    it('stops with its last subscriber, not before', () => {
        const clock = createClock(TICK);
        const stopFirst = clock.subscribe(() => {});
        const stopSecond = clock.subscribe(() => {});

        stopFirst();
        expect(vi.getTimerCount()).toBe(1);
        stopSecond();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('is set anew by the first subscriber after a pause', () => {
        const clock = createClock(TICK);
        clock.subscribe(() => {})();

        vi.advanceTimersByTime(10 * TICK);
        clock.subscribe(() => {});
        expect(clock.getSnapshot()).toBe(Date.now());
    });
});
