import { CLIENT_STATUS, REPOSITORY_STATUS } from '@pbcm/shared';

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
 * What the "Errors / Warnings" card says below its number: what the number is made of.
 * A part that is zero is left out, and with nothing left to mark as seen the card says
 * that instead.
 */
export function problemSummary(missed: number, failed: number): string {
    const parts = [failed > 0 ? `${failed} failed` : null, missed > 0 ? `${missed} missed` : null].filter(
        (part) => part !== null,
    );
    return parts.length > 0 ? parts.join(' · ') : 'Nothing to report';
}

/** The dot on "History" in words, for whoever cannot see it: `2 failed · 1 missed, not marked as seen`. */
export function describeUnseen(missed: number, failed: number): string | undefined {
    return missed + failed > 0 ? `${problemSummary(missed, failed)}, not marked as seen` : undefined;
}
