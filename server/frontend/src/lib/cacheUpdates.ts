import type {
    BackupJob,
    Client,
    GlobalHistoryEntry,
    HistoryEntry,
    SchedulerStatuses,
    SchedulerStatusUpdate,
    TunnelState,
} from '@pbcm/shared';

/**
 * What a dashboard message makes of a cache entry: `(what is cached, what arrived) => what
 * is cached now`. Pure, so every rule here is tested without a socket or a component --
 * `WebSocketProvider` only decides which entry a message belongs to.
 */

/**
 * Merges a live tunnel update into the client it belongs to. The tunnel state is
 * runtime-only on the server, so it arrives by broadcast rather than with the list.
 */
export function mergeTunnelState(clients: Client[], state: TunnelState): Client[] {
    return clients.map((c) => (c.id === state.clientId ? { ...c, tunnel: state } : c));
}

/** A job as the list across all clients holds it: with the client it belongs to. */
export interface GlobalJob extends BackupJob {
    clientId: string;
}

/**
 * Replaces one client's jobs, fed by the server's JOBS_UPDATE broadcast.
 *
 * The server caches an agent's jobs only while it is connected, so the list a dashboard
 * fetched goes stale the moment a client comes online or drops. Replacing per client
 * rather than refetching everything keeps the other clients' rows -- including their live
 * nextRunAt -- untouched.
 */
export function replaceClientJobs(jobs: GlobalJob[], clientId: string, clientJobs: BackupJob[]): GlobalJob[] {
    return [
        ...jobs.filter((j) => j.clientId !== clientId),
        ...clientJobs.map((job) => ({ ...job, clientId })),
    ];
}

/**
 * The agent recalculated when a job runs next; `null` means it is not scheduled.
 *
 * Works on both job lists: in the one across all clients a row names its client and has
 * to match it -- two clients may hold the same job id -- while a single client's own
 * list carries no client and is matched by the job alone.
 */
export function setJobNextRun<T extends BackupJob & { clientId?: string }>(
    jobs: T[],
    clientId: string,
    jobId: string,
    nextRunAt: string | null,
): T[] {
    return jobs.map((j) =>
        j.id === jobId && (j.clientId === undefined || j.clientId === clientId)
            ? { ...j, nextRunAt: nextRunAt ?? undefined }
            : j,
    );
}

/**
 * The newest run of every job mixes two shapes: rows fetched from GET /api/v1/history/latest
 * and entries pushed over the WebSocket, which arrive in the agent's HistoryEntry form.
 * Both satisfy the list's BaseHistoryItem contract; the one field where they differ
 * and that is read here -- the job's id, jobId vs jobConfigId -- goes through jobIdOf.
 *
 * The list does read hostname/displayName, though (`showClientName`), and only the
 * REST rows carry them -- an agent knows neither. applyRunToLatest therefore fills them
 * in from the client it is handed, so a job started here is not labelled "Unknown Client"
 * until the next refetch.
 */
export type SessionHistoryItem =
    | GlobalHistoryEntry
    | (HistoryEntry & {
          clientId: string;
          hostname: string | null;
          displayName: string | null;
      });

/** The job a history row belongs to, null for a row that belongs to none. */
export const jobIdOf = (item: SessionHistoryItem): string | null =>
    'jobId' in item ? item.jobId : item.jobConfigId;

const isSameJob = (a: SessionHistoryItem, b: SessionHistoryItem) =>
    a.clientId === b.clientId && jobIdOf(a) === jobIdOf(b);

const byStartTimeDesc = (a: SessionHistoryItem, b: SessionHistoryItem) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime();

/**
 * Takes a run's status update into the newest-run-per-job list, newest first.
 *
 * `client` is the client as the caller knows it -- `undefined` when it does not. The
 * same array comes back when the update changes nothing.
 */
export function applyRunToLatest(
    latest: SessionHistoryItem[],
    clientId: string,
    job: HistoryEntry,
    client: Pick<Client, 'hostname' | 'displayName'> | undefined,
): SessionHistoryItem[] {
    const entry: SessionHistoryItem = {
        ...job,
        clientId,
        hostname: client?.hostname ?? null,
        displayName: client?.displayName ?? null,
    };

    // An existing row may already carry the client columns from the REST
    // fetch, so the resolved ones only win where they actually resolved --
    // an unknown client must not blank out a name that was already there.
    const withNamesOf = (j: SessionHistoryItem): SessionHistoryItem => ({
        ...entry,
        hostname: entry.hostname ?? j.hostname,
        displayName: entry.displayName ?? j.displayName,
    });
    const merge = (j: SessionHistoryItem): SessionHistoryItem => ({
        ...j,
        ...withNamesOf(j),
    });

    // A run that belongs to no job has no row here.
    if (jobIdOf(entry) === null) return latest;

    // Same run: a status update of the row already shown.
    if (latest.some((j) => j.id === job.id)) {
        return latest.map((j) => (j.id === job.id ? merge(j) : j));
    }

    // Another run of a job already shown replaces its row -- unless it is older,
    // which a late status update of an earlier run can be.
    const current = latest.find((j) => isSameJob(j, entry));
    if (current && byStartTimeDesc(entry, current) > 0) return latest;

    // The row it replaces is of the same client, so its names still hold.
    return [
        current ? withNamesOf(current) : entry,
        ...latest.filter((j) => !isSameJob(j, entry)),
    ].sort(byStartTimeDesc);
}

/** Takes a run's status update into a client's history: the row it has, or a new first one. */
export function upsertRun(history: HistoryEntry[], job: HistoryEntry): HistoryEntry[] {
    return history.some((j) => j.id === job.id)
        ? history.map((j) => (j.id === job.id ? { ...j, ...job } : j))
        : [job, ...history];
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 10;

/**
 * The runs of the last 24 hours, at most ten, in the order of the history they are taken
 * from. A run counts by when it ended, or by when it started while it is still running.
 */
export function recentRuns(history: HistoryEntry[], now: number): HistoryEntry[] {
    const since = now - RECENT_WINDOW_MS;
    return history
        .filter((j) => new Date(j.endTime ?? j.startTime).getTime() > since)
        .slice(0, RECENT_LIMIT);
}

/** `SCHEDULER_STATUS_UPDATE` carries one scheduler at a time; the others stay as they are. */
export function applySchedulerUpdate(schedulers: SchedulerStatuses, update: SchedulerStatusUpdate): SchedulerStatuses {
    return { ...schedulers, [update.scheduler]: update.status };
}
