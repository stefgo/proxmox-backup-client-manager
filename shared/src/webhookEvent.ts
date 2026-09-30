import { JOB_STATUS } from "./constants.js";
import type { WebhookEventKind, WebhookLevel } from "./types.js";

/**
 * What a webhook reports. The server sends every webhook, and it reports two things:
 *
 * - **A run that has come to an end.** The agent keeps every run until the server has
 *   acknowledged it, so a run that ends while the server is away arrives late, never not at
 *   all. The server reports it when a write gives the run a final state it did not have
 *   before -- once, whether the run arrives live, with the history sync, or both.
 * - **An agent that went away and came back** -- the one thing no agent can report itself.
 *
 * Both have the same shape, so a template reads `event.kind`, `event.message` and
 * `event.detail` alike; `event.data` is what differs.
 *
 * Lives in `shared` so the editor's preview phrases a sample event with the same code the
 * server phrases the real one with.
 */

/** The fields of a history row an event is built from. */
export interface WebhookRun {
    id: string;
    jobId: string | null;
    name: string | null;
    type: string;
    status: string;
    startTime: string;
    endTime: string | null;
    exitCode: number | null;
    stderr: string | null;
}

export interface JobRunEvent {
    /** The id of the run. */
    id: string;
    kind: WebhookEventKind;
    level: WebhookLevel;
    /** When the run ended, on the agent's clock -- not when it reached the server. */
    occurredAt: string;
    /** The sentence a message would lead with, e.g. `Backup "Daily /home" failed`. */
    message: string;
    /** The last line of the run's error output, where there is one. */
    detail: string | null;
    data: {
        runId: string;
        jobId: string | null;
        jobName: string | null;
        type: string;
        status: string;
        startTime: string;
        endTime: string | null;
        durationSeconds: number | null;
        exitCode: number | null;
    };
}

/** An agent that stayed away past its grace period, or came back after that was reported. */
export interface ClientConnectionEvent {
    id: string;
    kind: "client.disconnected" | "client.reconnected";
    level: WebhookLevel;
    /** When the connection closed, or when it was back; on the server's clock. */
    occurredAt: string;
    message: string;
    detail: null;
    data: {
        clientId: string;
        /** When the connection closed. */
        disconnectedAt: string;
        /** When it was back; null in `client.disconnected`. */
        reconnectedAt: string | null;
        /** How long it was gone, up to `occurredAt`. */
        durationSeconds: number;
    };
}

export type WebhookEvent = JobRunEvent | ClientConnectionEvent;

const OUTCOMES: Record<string, { kind: WebhookEventKind; level: WebhookLevel; verb: string }> = {
    [JOB_STATUS.SUCCESS]: { kind: "job.succeeded", level: "info", verb: "succeeded" },
    [JOB_STATUS.FAILED]: { kind: "job.failed", level: "error", verb: "failed" },
    [JOB_STATUS.ABORTED]: { kind: "job.aborted", level: "warning", verb: "was aborted" },
    [JOB_STATUS.SKIPPED]: { kind: "job.skipped", level: "warning", verb: "was skipped" },
};

/** The statuses a run ends in, and that an event is sent for. */
export function isFinalJobStatus(status: string): boolean {
    return Object.prototype.hasOwnProperty.call(OUTCOMES, status);
}

/** How long a line of stderr may be in `event.detail`; the rest is in the history. */
const DETAIL_MAX_CHARS = 300;

/** proxmox-backup-client puts the reason last, as `Error: …`. */
function lastLine(text: string | null): string | null {
    const line = text
        ?.split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "")
        .pop();
    if (!line) return null;
    return line.length > DETAIL_MAX_CHARS ? `${line.slice(0, DETAIL_MAX_CHARS - 1)}…` : line;
}

function secondsBetween(from: string, to: string): number {
    const ms = Date.parse(to) - Date.parse(from);
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

/** A client whose connection closed at `disconnectedAt` and is still gone at `now`. */
export function clientDisconnectedEvent(
    id: string,
    clientId: string,
    disconnectedAt: string,
    now: string,
): ClientConnectionEvent {
    const durationSeconds = secondsBetween(disconnectedAt, now);
    return {
        id,
        kind: "client.disconnected",
        level: "warning",
        occurredAt: disconnectedAt,
        message: `Client has been disconnected for ${durationSeconds} s`,
        detail: null,
        data: { clientId, disconnectedAt, reconnectedAt: null, durationSeconds },
    };
}

/** A client that is back, after its disconnect was reported. */
export function clientReconnectedEvent(
    id: string,
    clientId: string,
    disconnectedAt: string,
    reconnectedAt: string,
): ClientConnectionEvent {
    const durationSeconds = secondsBetween(disconnectedAt, reconnectedAt);
    return {
        id,
        kind: "client.reconnected",
        level: "info",
        occurredAt: reconnectedAt,
        message: `Client is back after ${durationSeconds} s`,
        detail: null,
        data: { clientId, disconnectedAt, reconnectedAt, durationSeconds },
    };
}

/** Answers null for a run that has not ended -- queued or running. */
export function jobRunEvent(run: WebhookRun): JobRunEvent | null {
    const outcome = OUTCOMES[run.status];
    if (!outcome) return null;

    const isRestore = run.type === "restore";
    // A restore is named `Restore: <snapshot>` by the agent; the label says that already.
    const title = (run.name ?? "").replace(/^Restore:\s*/, "") || "Unknown";
    const started = Date.parse(run.startTime);
    const ended = run.endTime ? Date.parse(run.endTime) : NaN;

    return {
        id: run.id,
        kind: outcome.kind,
        level: outcome.level,
        occurredAt: run.endTime ?? run.startTime,
        message: `${isRestore ? "Restore" : "Backup"} "${title}" ${outcome.verb}`,
        detail: run.status === JOB_STATUS.SUCCESS ? null : lastLine(run.stderr),
        data: {
            runId: run.id,
            jobId: run.jobId,
            jobName: run.name,
            type: run.type,
            status: run.status,
            startTime: run.startTime,
            endTime: run.endTime,
            durationSeconds:
                Number.isFinite(started) && Number.isFinite(ended)
                    ? Math.max(0, Math.round((ended - started) / 1000))
                    : null,
            exitCode: run.exitCode,
        },
    };
}
