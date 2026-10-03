import { JOB_STATUS, type RunSnapshotDetails } from '@pbcm/shared';
import { durationBetween, formatDuration } from '../../../lib/time';
import { formatBytes } from '../../../utils';

/** What of a run its row sums up. */
export interface RunSummaryInput {
    type: string;
    status: string;
    startTime: string;
    endTime?: string | null;
    snapshotDetails?: RunSnapshotDetails | null;
}

export interface RunSummary {
    /** How long the run took; `null` while it is running. */
    duration: string | null;
    /** What a successful backup left on the PBS; `null` for every other run. */
    size: string | null;
}

/**
 * What a history row says about a run without being opened: how long it took and, for a
 * backup that succeeded, how large its snapshot is.
 *
 * A run still going has no duration -- the time since its start is not one, and a row
 * that counted up would need a clock in the render.
 */
export function runSummary(item: RunSummaryInput): RunSummary {
    const running = item.status === JOB_STATUS.RUNNING;
    const ms = running ? null : durationBetween(item.startTime, item.endTime);
    const size =
        item.type === 'backup' && item.status === JOB_STATUS.SUCCESS ? item.snapshotDetails?.size : undefined;
    return {
        duration: ms === null ? null : formatDuration(ms),
        size: size === undefined ? null : formatBytes(size),
    };
}
