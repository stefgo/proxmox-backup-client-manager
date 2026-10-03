/** Where a scrolling box stands, as its element reports it. */
export interface ScrollPosition {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}

/** A line's height, about: sub-pixel rounding must not count as having scrolled away. */
const TOLERANCE_PX = 16;

/**
 * Whether the box shows its end. A live log follows new output only while it does: an
 * operator who scrolled up to read something is not pulled back down by the next line.
 */
export const isAtEnd = ({ scrollTop, scrollHeight, clientHeight }: ScrollPosition): boolean =>
    scrollHeight - scrollTop - clientHeight <= TOLERANCE_PX;
