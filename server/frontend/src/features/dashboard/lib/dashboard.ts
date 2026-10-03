import { CLIENT_STATUS, REPOSITORY_STATUS } from '@pbcm/shared';
import { canAbortRun, type AbortableRun } from '../../history/lib/runAbort';
import { parseTimestamp } from '../../../lib/time';

/**
 * The numbers the dashboard's cards and the sidebar's badges both show. Counted here, once,
 * so the two cannot disagree about how many clients are online.
 */

interface WithStatus {
    status?: string | null;
}

export interface OnlineCount {
    online: number;
    total: number;
}

export const clientCount = (clients: readonly WithStatus[]): OnlineCount => ({
    online: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
    total: clients.length,
});

export const repositoryCount = (repositories: readonly WithStatus[]): OnlineCount => ({
    online: repositories.filter((r) => r.status === REPOSITORY_STATUS.ONLINE).length,
    total: repositories.length,
});

/** `3 / 5`, as a card and a badge write it. */
export const formatOnlineCount = ({ online, total }: OnlineCount): string => `${online} / ${total}`;

/** The same count in words, for where the pair of numbers has to explain itself: `3 of 5 online`. */
export const describeOnlineCount = ({ online, total }: OnlineCount): string => `${online} of ${total} online`;

/** The jobs badge in words: `2 jobs active`. */
export const describeActiveJobs = (count: number): string => `${count} ${count === 1 ? 'job' : 'jobs'} active`;

const onlineIds = (clients: readonly (WithStatus & { id: string })[]): Set<string> =>
    new Set(clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).map((c) => c.id));

/**
 * The jobs on clients that are online. There is no total to put beside it: the server
 * knows a client's jobs only while its agent is connected, so a job of an offline client
 * is in the list by leftover at best.
 */
export function activeJobCount(
    jobs: readonly { clientId: string }[],
    clients: readonly (WithStatus & { id: string })[],
): number {
    const online = onlineIds(clients);
    return jobs.filter((job) => online.has(job.clientId)).length;
}

/**
 * How long past its time a job may be before it counts as missed. The agent's scheduler
 * starts a due job on its next tick, and the new `nextRunAt` takes a moment to arrive.
 */
export const MISSED_GRACE_MS = 60_000;

interface ScheduledJob {
    id?: string | null;
    clientId: string;
    scheduleEnabled?: boolean | null;
    nextRunAt?: string | null;
}

/**
 * The jobs whose scheduled run did not happen: the schedule is on, the time it names is
 * past by more than the grace, and nothing is running that would explain it.
 *
 * Only on clients that are online. An offline client's jobs are not known, and that it is
 * offline is said by the card above -- its jobs would be missed for a reason already shown.
 *
 * A job whose run is under way or queued is not missed: its `nextRunAt` moves on when
 * that run ends.
 */
export function missedJobs<J extends ScheduledJob>(
    jobs: readonly J[],
    clients: readonly (WithStatus & { id: string })[],
    lastRunOf: (job: J) => AbortableRun | undefined,
    now: number,
    graceMs: number = MISSED_GRACE_MS,
): J[] {
    const online = onlineIds(clients);
    return jobs.filter((job) => {
        if (!job.scheduleEnabled || !online.has(job.clientId)) return false;
        const due = parseTimestamp(job.nextRunAt)?.getTime();
        if (due === undefined || now - due <= graceMs) return false;
        const run = lastRunOf(job);
        return !(run && canAbortRun(run));
    });
}

/**
 * What the "Errors / Warnings" card says below its number: what the number is made of.
 * A part that is zero is left out, and with nothing wrong the card says that instead.
 */
export function problemSummary(missed: number, failed: number): string {
    const parts = [missed > 0 ? `${missed} missed` : null, failed > 0 ? `${failed} failed` : null].filter(
        (part) => part !== null,
    );
    return parts.length > 0 ? parts.join(' · ') : 'Nothing to report';
}
