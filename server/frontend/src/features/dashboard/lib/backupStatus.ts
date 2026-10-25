import { JOB_STATUS } from '@pbcm/shared';
import { jobIdOf, type GlobalJob, type SessionHistoryItem } from '../../../lib/cacheUpdates';
import { parseTimestamp } from '../../../lib/time';

/**
 * The last run of every job as the dashboard's "Backup status" lists it, and the runs the
 * findings judge.
 */

/**
 * Leaves out the runs of deleted jobs -- as far as that can be told. The server knows a
 * client's jobs only while its agent is connected and has sent its list (`knownClients`),
 * so "not in the list" means deleted only for such a client. Any other client keeps its rows.
 */
export function existingJobRuns(
    latest: readonly SessionHistoryItem[],
    jobs: readonly GlobalJob[],
    knownClients: readonly string[],
): SessionHistoryItem[] {
    const known = new Set(knownClients);
    const existing = new Set(jobs.filter((job) => job.id).map((job) => `${job.clientId}/${job.id}`));
    return latest.filter((row) => {
        if (!known.has(row.clientId)) return true;
        const jobId = jobIdOf(row);
        return jobId !== null && existing.has(`${row.clientId}/${jobId}`);
    });
}

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
