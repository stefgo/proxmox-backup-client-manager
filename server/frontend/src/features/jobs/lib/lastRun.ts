import { jobIdOf, type SessionHistoryItem } from '../../../lib/cacheUpdates';
import { parseTimestamp } from '../../../lib/time';

/** What a job row shows of its last run. */
export interface LastRun {
    status: string;
    startTime: string;
    endTime?: string | null;
}

/** A job is named by its client and its id: two clients may hold the same job id. */
export const lastRunKey = (clientId: string, jobId: string) => `${clientId}/${jobId}`;

const startOf = (run: SessionHistoryItem) => parseTimestamp(run.startTime)?.getTime() ?? 0;

/**
 * The newest run of every job, by `lastRunKey`. Takes the list `GET /api/v1/history/latest`
 * fills and `JOB_UPDATE` keeps current, in either of its two row shapes.
 *
 * That list holds one row per job already. Should it ever hold two, the later start wins
 * rather than the later position, so the answer does not turn on the list's order.
 */
export function lastRunByJob(latest: SessionHistoryItem[]): Map<string, SessionHistoryItem> {
    const byJob = new Map<string, SessionHistoryItem>();
    for (const run of latest) {
        const jobId = jobIdOf(run);
        // A run that belongs to no job is nobody's last run.
        if (jobId === null) continue;
        const key = lastRunKey(run.clientId, jobId);
        const known = byJob.get(key);
        if (!known || startOf(run) > startOf(known)) byJob.set(key, run);
    }
    return byJob;
}
