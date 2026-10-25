import type { To } from 'react-router-dom';
import {
    CLIENT_STATUS,
    JOB_STATUS,
    MISSED_AFTER_MS,
    REPOSITORY_STATUS,
    TUNNEL_STATUS,
    type Client,
} from '@pbcm/shared';
import { clientTab, paths } from '../../../lib/paths';
import { jobIdOf, type GlobalJob, type SessionHistoryItem } from '../../../lib/cacheUpdates';
import { parseTimestamp } from '../../../lib/time';
import { awaitsRegistration } from '../../clients/lib/registration';

/**
 * What needs a look across the backups right now, as the dashboard's "Needs attention" lists it.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark as seen. That is what tells it from a run under
 * "Errors / Warnings", which records that something happened and stays until somebody has
 * looked. Everything is read from what the cache already holds and the socket keeps current.
 */

export type FindingSeverity = 'error' | 'warning';

/** Every kind of finding, in the order the list shows them within a severity: hosts first. */
const FINDING_TYPES = [
    'client-offline',
    'repository-offline',
    'tunnel-error',
    'client-without-jobs',
    'run-failed',
    'run-aborted',
    'run-missed',
    'run-overdue',
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

export interface Finding {
    /** What makes this finding this one: its type and what it is about. Not its text. */
    id: string;
    type: FindingType;
    severity: FindingSeverity;
    text: string;
    /** Where the reader can do something about it. */
    to?: To;
    /** Since when it is so, where that is known. */
    since?: string | null;
}

interface RepositoryLike {
    id: string | number;
    baseUrl: string;
    datastore: string;
    status: string;
}

export interface FindingsInput {
    clients: readonly Client[];
    repositories: readonly RepositoryLike[];
    jobs: readonly GlobalJob[];
    /** The clients whose job list the server holds; see `useGlobalJobs`. */
    knownClients: readonly string[];
    /** The last run of every job that still exists (`existingJobRuns`). */
    latest: readonly SessionHistoryItem[];
    now: number;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1 };

const nameOf = (client: Pick<Client, 'displayName' | 'hostname'>) => client.displayName || client.hostname;

/** What a last run that went wrong turns into; a status not listed here is no finding. */
const RUN_FINDINGS: Partial<Record<string, { type: FindingType; severity: FindingSeverity; what: string }>> = {
    [JOB_STATUS.FAILED]: { type: 'run-failed', severity: 'error', what: 'failed' },
    [JOB_STATUS.ABORTED]: { type: 'run-aborted', severity: 'warning', what: 'was aborted' },
    [JOB_STATUS.MISSED]: { type: 'run-missed', severity: 'warning', what: 'was missed' },
};

const UNDER_WAY = new Set<string>([JOB_STATUS.RUNNING, JOB_STATUS.QUEUED]);

/**
 * What is wrong with a client that is there: its tunnel, and whether it has a job at all.
 * Asked only once the server holds its list -- right after the agent connects it is empty
 * because nothing has arrived yet, not because there is no job.
 */
function clientFindings(client: Client, jobs: readonly GlobalJob[], known: ReadonlySet<string>): Finding[] {
    const host = nameOf(client);
    const found: Finding[] = [];
    if (client.tunnel?.status === TUNNEL_STATUS.ERROR) {
        const reason = client.tunnel.lastError ? `: ${client.tunnel.lastError}` : '';
        found.push({
            id: `tunnel-error:${client.id}`,
            type: 'tunnel-error',
            severity: 'warning',
            text: `The SSH tunnel of ${host} is down${reason}`,
            to: paths.client(client.id),
        });
    }
    if (known.has(client.id) && !jobs.some((job) => job.clientId === client.id)) {
        found.push({
            id: `client-without-jobs:${client.id}`,
            type: 'client-without-jobs',
            severity: 'warning',
            text: `${host} has no backup job`,
            to: paths.client(client.id),
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
    jobs: readonly GlobalJob[],
    lastRuns: ReadonlyMap<string, SessionHistoryItem>,
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
            type: 'run-overdue',
            severity: 'warning',
            text: `"${job.name}" on ${nameOf(client)} was due and has not started`,
            to: paths.job(client.id, job.id),
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
function runFindings(latest: readonly SessionHistoryItem[], clients: ReadonlyMap<string, Client>): Finding[] {
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
            to: clientTab(run.clientId, 'history'),
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
    const lastRuns = new Map<string, SessionHistoryItem>();
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
                type: 'client-offline',
                severity: 'error',
                text: `${nameOf(client)} is offline`,
                to: paths.client(client.id),
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
            type: 'repository-offline',
            severity: 'error',
            text: `The repository ${repository.datastore} at ${repository.baseUrl} does not answer`,
            to: paths.repository(repository.id),
        });
    }

    found.push(...runFindings(latest, registered));

    return found.sort(
        (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            FINDING_TYPES.indexOf(a.type) - FINDING_TYPES.indexOf(b.type) ||
            a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }),
    );
}

export type BackupStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export const BACKUP_STATUS: Record<BackupStatus, { label: string; description: string; tone: string }> = {
    healthy: { label: 'Healthy', description: 'Nothing needs attention', tone: 'text-success' },
    degraded: { label: 'Degraded', description: 'Something needs a look', tone: 'text-warning' },
    critical: { label: 'Critical', description: 'Something is broken', tone: 'text-error' },
    unknown: { label: 'Unknown', description: 'No client is registered yet', tone: 'text-text-muted' },
};

/** How the backups are doing, by their worst finding. With no registered client nothing can be said. */
export function backupStatus(findings: readonly Finding[], clients: readonly Client[]): BackupStatus {
    if (!clients.some((c) => !awaitsRegistration(c))) return 'unknown';
    if (findings.some((f) => f.severity === 'error')) return 'critical';
    if (findings.length > 0) return 'degraded';
    return 'healthy';
}

/** "3 findings", or what the status means where there is none. */
export function findingSummary(findings: readonly Finding[], status: BackupStatus): string {
    if (findings.length === 0) return BACKUP_STATUS[status].description;
    return `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SPANS = [
    [365 * DAY, 'year'],
    [30 * DAY, 'month'],
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
] as const;

/**
 * How long a finding has lasted, in a few words under it: `For 3 hours`. Rounded down, in
 * the largest unit that fits; null where the start is not known or lies ahead.
 */
export function findingAge(finding: Pick<Finding, 'since'>, now: number): string | null {
    const since = parseTimestamp(finding.since);
    if (!since) return null;
    const span = now - since.getTime();
    if (span < 0) return null;
    for (const [size, unit] of SPANS) {
        const count = Math.floor(span / size);
        if (count >= 1) return `For ${count} ${unit}${count === 1 ? '' : 's'}`;
    }
    return 'For less than a minute';
}
