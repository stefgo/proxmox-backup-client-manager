import { JOB_STATUS } from '@pbcm/shared';
import type { SessionHistoryItem } from '../../../lib/cacheUpdates';
import { parseTimestamp } from '../../../lib/time';

/**
 * The last run of every job as the dashboard's "Backup status" lists it, and the runs the
 * findings judge.
 */

// Lives in shared, where the server's status report leaves out the same runs.
export { existingJobRuns } from '@pbcm/shared';

/** How loudly a last run asks for a look; the lower, the higher up the list. */
const RANK: Record<string, number> = {
    [JOB_STATUS.FAILED]: 0,
    [JOB_STATUS.ABORTED]: 1,
    [JOB_STATUS.MISSED]: 1,
    [JOB_STATUS.RUNNING]: 2,
    [JOB_STATUS.QUEUED]: 2,
    [JOB_STATUS.SUCCESS]: 4,
};
/** A status not listed above -- `skipped`, or one a newer agent knows -- sits before the successes. */
const OTHER_RANK = 3;

const startOf = (row: SessionHistoryItem) => parseTimestamp(row.startTime)?.getTime() ?? 0;

/**
 * Problems first -- failed, then aborted or missed, then what is under way -- and within each
 * the oldest first: among the successes, that is the backup that has gone longest without a
 * new one.
 */
export function byBackupStatus(rows: readonly SessionHistoryItem[]): SessionHistoryItem[] {
    const rank = (row: SessionHistoryItem) => RANK[row.status] ?? OTHER_RANK;
    return [...rows].sort((a, b) => rank(a) - rank(b) || startOf(a) - startOf(b));
}
