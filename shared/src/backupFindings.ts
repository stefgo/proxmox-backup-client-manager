import { CLIENT_STATUS, CONNECTION_MODE, JOB_STATUS, REPOSITORY_STATUS, TUNNEL_STATUS } from "./constants.js";
import { MISSED_AFTER_MS } from "./schedule.js";
import type { BackupJob, Client } from "./types.js";

/**
 * What needs a look across the backups right now, as the dashboard's "Needs attention" lists
 * it -- and as the server's status report (`GET /api/v1/status`) answers it. One
 * implementation for both, so the two cannot disagree. Where a finding leads is a `target`
 * here; the dashboard turns it into a link.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark as seen. That is what tells it from a run
 * under "Errors / Warnings", which records that something happened and stays until somebody
 * has looked.
 */

/**
 * A timestamp as the server and the agents send it, as a `Date` -- `null` for none and for
 * one that does not parse.
 *
 * SQLite's default format, `YYYY-MM-DD HH:MM:SS`, carries no zone and is UTC. Read as it
 * stands it would be taken for local time, and a run would start hours off.
 */
export function parseTimestamp(value: Date | string | number | null | undefined): Date | null {
    if (value === null || value === undefined || value === "") return null;
    const date =
        typeof value === "string" && value.includes(" ") && !value.includes("T")
            ? new Date(value.replace(" ", "T") + "Z")
            : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether an inbound client still waits for its first agent. It is created when its token
 * is issued and has been seen by nobody since; an outbound client is only stored once the
 * server has reached its agent, so it never waits.
 */
export const awaitsRegistration = (client: Pick<Client, "connectionMode" | "lastSeen">): boolean =>
    client.connectionMode !== CONNECTION_MODE.OUTBOUND && !client.lastSeen;

/** A job as the findings read it: with the client it belongs to. */
export type FindingJob = Pick<BackupJob, "id" | "name" | "schedule" | "scheduleEnabled" | "nextRunAt"> & {
    clientId: string;
};

/**
 * A run as the findings read it. The server's history names the job `jobId`, a run an agent
 * reported `jobConfigId`; `jobIdOf` reads either.
 */
export type FindingRun = {
    clientId: string;
    status: string;
    name?: string | null;
    startTime: string;
    endTime: string | null;
} & ({ jobId: string | null } | { jobConfigId: string | null });

/** The job a history row belongs to, null for a row that belongs to none. */
export const jobIdOf = (item: { jobId: string | null } | { jobConfigId: string | null }): string | null =>
    "jobId" in item ? item.jobId : item.jobConfigId;

/**
 * Leaves out the runs of deleted jobs -- as far as that can be told. The server knows a
 * client's jobs only while its agent is connected and has sent its list (`knownClients`),
 * so "not in the list" means deleted only for such a client. Any other client keeps its rows.
 */
export function existingJobRuns<R extends FindingRun>(
    latest: readonly R[],
    jobs: readonly Pick<FindingJob, "id" | "clientId">[],
    knownClients: readonly string[],
): R[] {
    const known = new Set(knownClients);
    const existing = new Set(jobs.filter((job) => job.id).map((job) => `${job.clientId}/${job.id}`));
    return latest.filter((row) => {
        if (!known.has(row.clientId)) return true;
        const jobId = jobIdOf(row);
        return jobId !== null && existing.has(`${row.clientId}/${jobId}`);
    });
}

export type FindingSeverity = "error" | "warning";

/** Every kind of finding, in the order the list shows them within a severity: hosts first. */
const FINDING_TYPES = [
    "client-offline",
    "repository-offline",
    "tunnel-error",
    "client-without-jobs",
    "run-failed",
    "run-aborted",
    "run-missed",
    "run-overdue",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

/** Where a finding can be dealt with: a page of the dashboard, named rather than linked. */
export type FindingTarget =
    | { kind: "client"; clientId: string }
    | { kind: "client-history"; clientId: string }
    | { kind: "job"; clientId: string; jobId: string }
    | { kind: "repository"; id: string | number };

export interface Finding {
    /** What makes this finding this one: its type and what it is about. Not its text. */
    id: string;
    type: FindingType;
    severity: FindingSeverity;
    text: string;
    /** Where the reader can do something about it. */
    target?: FindingTarget;
    /** Since when it is so, where that is known. */
    since?: string | null;
}

/** A repository as the findings read it: with what its last check answered. */
export interface FindingRepository {
    id: string | number;
    baseUrl: string;
    datastore: string;
    status: string;
}

export interface FindingsInput {
    clients: readonly Client[];
    repositories: readonly FindingRepository[];
    jobs: readonly FindingJob[];
    /** The clients whose job list the server holds. */
    knownClients: readonly string[];
    /** The last run of every job that still exists (`existingJobRuns`). */
    latest: readonly FindingRun[];
    now: number;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1 };

const nameOf = (client: Pick<Client, "displayName" | "hostname">) => client.displayName || client.hostname;

/** What a last run that went wrong turns into; a status not listed here is no finding. */
const RUN_FINDINGS: Partial<Record<string, { type: FindingType; severity: FindingSeverity; what: string }>> = {
    [JOB_STATUS.FAILED]: { type: "run-failed", severity: "error", what: "failed" },
    [JOB_STATUS.ABORTED]: { type: "run-aborted", severity: "warning", what: "was aborted" },
    [JOB_STATUS.MISSED]: { type: "run-missed", severity: "warning", what: "was missed" },
};

const UNDER_WAY = new Set<string>([JOB_STATUS.RUNNING, JOB_STATUS.QUEUED]);

/**
 * What is wrong with a client that is there: its tunnel, and whether it has a job at all.
 * Asked only once the server holds its list -- right after the agent connects it is empty
 * because nothing has arrived yet, not because there is no job.
 */
function clientFindings(client: Client, jobs: readonly FindingJob[], known: ReadonlySet<string>): Finding[] {
    const host = nameOf(client);
    const found: Finding[] = [];
    if (client.tunnel?.status === TUNNEL_STATUS.ERROR) {
        const reason = client.tunnel.lastError ? `: ${client.tunnel.lastError}` : "";
        found.push({
            id: `tunnel-error:${client.id}`,
            type: "tunnel-error",
            severity: "warning",
            text: `The SSH tunnel of ${host} is down${reason}`,
            target: { kind: "client", clientId: client.id },
        });
    }
    if (known.has(client.id) && !jobs.some((job) => job.clientId === client.id)) {
        found.push({
            id: `client-without-jobs:${client.id}`,
            type: "client-without-jobs",
            severity: "warning",
            text: `${host} has no backup job`,
            target: { kind: "client", clientId: client.id },
        });
    }
    return found;
}

/**
 * The scheduled runs that are due and have not started: the agent's scheduler is the one
 * that moves `nextRunAt` on, so a time that has passed by more than the grace a late start
 * is allowed says it has stopped. A run under way has started, whatever the time says.
 */
function overdueRuns(
    client: Client,
    jobs: readonly FindingJob[],
    lastRuns: ReadonlyMap<string, FindingRun>,
    now: number,
): Finding[] {
    const found: Finding[] = [];
    for (const job of jobs) {
        if (job.clientId !== client.id || !job.id || !job.schedule || !job.scheduleEnabled) continue;
        const due = parseTimestamp(job.nextRunAt);
        if (!due || now - due.getTime() <= MISSED_AFTER_MS) continue;
        const last = lastRuns.get(`${client.id}/${job.id}`);
        if (last && UNDER_WAY.has(last.status)) continue;
        found.push({
            id: `run-overdue:${client.id}:${job.id}`,
            type: "run-overdue",
            severity: "warning",
            text: `"${job.name}" on ${nameOf(client)} was due and has not started`,
            target: { kind: "job", clientId: client.id, jobId: job.id },
            since: job.nextRunAt,
        });
    }
    return found;
}

/**
 * The jobs whose last run went wrong. Judged on every client still registered, offline ones
 * included: the runs come from the server's history, and a failure is not made good by its
 * host going away. A later run that succeeds takes the finding with it.
 */
function runFindings(latest: readonly FindingRun[], clients: ReadonlyMap<string, Client>): Finding[] {
    const found: Finding[] = [];
    for (const run of latest) {
        const kind = RUN_FINDINGS[run.status];
        const client = clients.get(run.clientId);
        const jobId = jobIdOf(run);
        if (!kind || !client || jobId === null) continue;
        found.push({
            id: `${kind.type}:${run.clientId}:${jobId}`,
            type: kind.type,
            severity: kind.severity,
            text: `The last run of "${run.name || jobId}" on ${nameOf(client)} ${kind.what}`,
            target: { kind: "client-history", clientId: run.clientId },
            since: run.endTime ?? run.startTime,
        });
    }
    return found;
}

/**
 * Everything that needs a look: errors first, then by kind -- what is wrong with a host or a
 * repository before what is wrong with a job -- then by text. A client that is offline gets
 * that one finding and no other of its own: the server does not know its jobs while it is
 * away, so neither a missing job nor an overdue one can be told.
 */
export function buildFindings({ clients, repositories, jobs, knownClients, latest, now }: FindingsInput): Finding[] {
    const found: Finding[] = [];
    const known = new Set(knownClients);
    const registered = new Map<string, Client>();
    const lastRuns = new Map<string, FindingRun>();
    for (const run of latest) {
        const jobId = jobIdOf(run);
        if (jobId !== null) lastRuns.set(`${run.clientId}/${jobId}`, run);
    }

    for (const client of clients) {
        if (awaitsRegistration(client)) continue;
        registered.set(client.id, client);
        if (client.status !== CLIENT_STATUS.ONLINE) {
            found.push({
                id: `client-offline:${client.id}`,
                type: "client-offline",
                severity: "error",
                text: `${nameOf(client)} is offline`,
                target: { kind: "client", clientId: client.id },
                since: client.lastSeen,
            });
            continue;
        }
        found.push(...clientFindings(client, jobs, known), ...overdueRuns(client, jobs, lastRuns, now));
    }

    // Only one that did not answer: `unknown` and `loading` say nothing about it yet.
    for (const repository of repositories) {
        if (repository.status !== REPOSITORY_STATUS.OFFLINE) continue;
        found.push({
            id: `repository-offline:${repository.id}`,
            type: "repository-offline",
            severity: "error",
            text: `The repository ${repository.datastore} at ${repository.baseUrl} does not answer`,
            target: { kind: "repository", id: repository.id },
        });
    }

    found.push(...runFindings(latest, registered));

    return found.sort(
        (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            FINDING_TYPES.indexOf(a.type) - FINDING_TYPES.indexOf(b.type) ||
            a.text.localeCompare(b.text, undefined, { sensitivity: "base" }),
    );
}

export type BackupStatus = "healthy" | "degraded" | "critical" | "unknown";

/** How the backups are doing, by their worst finding. With no registered client nothing can be said. */
export function backupStatus(
    findings: readonly Pick<Finding, "severity">[],
    clients: readonly Pick<Client, "connectionMode" | "lastSeen">[],
): BackupStatus {
    if (!clients.some((c) => !awaitsRegistration(c))) return "unknown";
    if (findings.some((f) => f.severity === "error")) return "critical";
    if (findings.length > 0) return "degraded";
    return "healthy";
}

interface WithStatus {
    status?: string | null;
}

/** How many are online, of how many. */
export interface OnlineCount {
    online: number;
    total: number;
}

/** How many clients are online: the dashboard's card, the sidebar's badge and the status report count with this. */
export const clientCount = (clients: readonly WithStatus[]): OnlineCount => ({
    online: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
    total: clients.length,
});

/** How many repositories answered their last check. */
export const repositoryCount = (repositories: readonly WithStatus[]): OnlineCount => ({
    online: repositories.filter((r) => r.status === REPOSITORY_STATUS.ONLINE).length,
    total: repositories.length,
});

/**
 * The jobs on clients that are online. There is no total to put beside it: the server
 * knows a client's jobs only while its agent is connected, so a job of an offline client
 * is in the list by leftover at best.
 */
export function activeJobCount(
    jobs: readonly { clientId: string }[],
    clients: readonly (WithStatus & { id: string })[],
): number {
    const online = new Set(clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).map((c) => c.id));
    return jobs.filter((job) => online.has(job.clientId)).length;
}
