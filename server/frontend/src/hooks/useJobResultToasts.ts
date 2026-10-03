import { useEffect } from 'react';
import { JOB_STATUS } from '@pbcm/shared';
import { useToast } from '@stefgo/react-ui-components';
import { subscribe } from '../lib/realtimeEvents';
import { getCachedClient } from '../queries/clients';
import { refreshUnseen } from '../queries/history';

/**
 * The states a run ends in. `skipped` is left out: nothing ran, so there is nothing to
 * report. `missed` is in: nothing ran there either, but when it should have.
 */
const FINISHED: readonly string[] = [JOB_STATUS.SUCCESS, JOB_STATUS.FAILED, JOB_STATUS.ABORTED, JOB_STATUS.MISSED];

/** The ends a user has to mark as seen: what went wrong, and what did not happen. */
const TO_BE_SEEN: readonly string[] = [JOB_STATUS.FAILED, JOB_STATUS.MISSED];

/**
 * Jobs started from this browser whose result has not arrived yet, as `clientId:jobId`.
 *
 * Module state rather than a store: nothing renders from it, and the wait has to outlive
 * the page the job was started from -- a backup runs for minutes to hours.
 */
const pendingRuns = new Set<string>();

/** Runs already reported, by run id. An agent re-sends a finished run after a reconnect. */
const reported = new Set<string>();

/**
 * When this page was loaded. A run that ended before it was over before anyone here could
 * have been told -- it arrives only because an agent synced it late.
 */
const loadedAt = new Date().toISOString();

/** Notes that the user started this job, so its result is reported even when it succeeds. */
export function markJobRunAsked(clientId: string, jobId: string): void {
    pendingRuns.add(`${clientId}:${jobId}`);
}

/** Undoes `markJobRunAsked` for a job whose start was refused. */
export function forgetJobRunAsked(clientId: string, jobId: string): void {
    pendingRuns.delete(`${clientId}:${jobId}`);
}

/**
 * Turns finished runs into toasts, on whatever page the user is. Mounted once, in the
 * shell. A failure is always reported and stays until dismissed, and so is a missed
 * schedule; a success or an abort only for a job started from this browser, since with
 * many clients every scheduled run would otherwise raise one.
 *
 * A failure and a missed schedule are also one more to mark as seen, so the count behind
 * the dashboard's card and the dot on "History" is read again.
 */
export function useJobResultToasts(): void {
    const { show } = useToast();

    useEffect(() => {
        return subscribe('jobUpdate', ({ clientId, job }) => {
            if (!FINISHED.includes(job.status) || !job.endTime) return;
            if (reported.has(job.id)) return;
            reported.add(job.id);

            if (TO_BE_SEEN.includes(job.status)) refreshUnseen();
            if (job.endTime < loadedAt) return;

            const client = getCachedClient(clientId);
            const subject = `${client?.displayName || client?.hostname || 'Unknown client'}: ${job.name || 'Job'}`;

            // Not the answer to a run asked for here: that is the catch-up after it,
            // whose result is still to come -- so `pendingRuns` is left as it is.
            if (job.status === JOB_STATUS.MISSED) {
                show({
                    variant: 'warning',
                    title: `${subject} missed its schedule`,
                    description: job.error || undefined,
                    duration: 0,
                });
                return;
            }

            const key = `${clientId}:${job.jobId ?? job.jobConfigId ?? ''}`;
            const asked = pendingRuns.delete(key);
            if (job.status !== JOB_STATUS.FAILED && !asked) return;

            if (job.status === JOB_STATUS.FAILED) {
                show({
                    variant: 'error',
                    title: `${subject} failed`,
                    description: job.error || (job.exitCode != null ? `Exit code ${job.exitCode}` : undefined),
                    duration: 0,
                });
            } else if (job.status === JOB_STATUS.ABORTED) {
                show({ variant: 'warning', title: `${subject} was aborted` });
            } else {
                show({ variant: 'success', title: `${subject} succeeded` });
            }
        });
    }, [show]);
}
