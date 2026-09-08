import {
    WS_EVENTS,
    JOB_STATUS,
    WsMessage,
    StatusUpdatePayloadSchema,
    LogUpdatePayloadSchema,
    SyncHistoryPayloadSchema,
    JobNextRunUpdatePayloadSchema,
    TunnelReleaseSchema,
    FingerprintObservedSchema,
} from "@pbcm/shared";
import { ProxyService } from "../../services/ProxyService.js";
import { TunnelService } from "../../services/TunnelService.js";
import { JobHistoryRepository } from "../../repositories/JobHistoryRepository.js";
import { TunnelLease } from "./TunnelLease.js";

/**
 * The subset of a Fastify logger this module needs. Both connection kinds hand one in:
 * the inbound path passes `fastify.log`, the outbound path a wrapper around the shared
 * logger, so their messages stay attributable to the right connection.
 */
export type AgentLogger = {
    info: (o: any) => void;
    warn: (o: any) => void;
    error: (o: any) => void;
};

/**
 * A run that reached one of these is over and belongs in the history table. Typed as
 * string[] on purpose: the payload's status stays a plain string on the wire, so an
 * agent on an older build is never dropped for reporting something unfamiliar.
 */
const TERMINAL_JOB_STATUSES: string[] = [
    JOB_STATUS.SUCCESS,
    JOB_STATUS.FAILED,
    JOB_STATUS.ABORTED,
];

/** Everything a handler is given. Grouped so the table's signature stays one line. */
interface AgentMessageContext {
    clientId: string;
    socket: any;
    data: WsMessage;
    log: AgentLogger;
}

type AgentMessageHandler = (ctx: AgentMessageContext) => void | Promise<void>;

/**
 * Routes post-authentication messages from an agent.
 *
 * This was an `if` chain of seven branches, so every message was compared against all
 * seven types whether or not the first one matched. A table also makes the protocol
 * surface readable in one place — the same reason `INBOUND_SCHEMAS` in the agent's
 * `core/Connection.ts` is a map rather than a chain.
 *
 * Shared by both connection modes: inbound clients dial in, outbound clients are dialed
 * by the server, but the protocol from here on is identical.
 */
const HANDLERS: Partial<Record<string, AgentMessageHandler>> = {
    /** A job changed state. Terminal states are also written to the history table. */
    [WS_EVENTS.STATUS_UPDATE]: ({ clientId, data, log }) => {
        const parsed = StatusUpdatePayloadSchema.safeParse(data.payload);
        if (!parsed.success) {
            log.warn({
                msg: "Invalid STATUS_UPDATE payload",
                errors: parsed.error,
            });
            return;
        }
        const statusPayload = parsed.data;

        if (TERMINAL_JOB_STATUSES.includes(statusPayload.status)) {
            try {
                JobHistoryRepository.upsertStatus(clientId, statusPayload);
            } catch (err) {
                log.error({ msg: "Failed to save job history", err });
            }
        }

        ProxyService.broadcastToDashboard({
            type: "JOB_UPDATE",
            payload: { clientId, job: statusPayload },
        });
    },

    /** stdout/stderr of a running job, streamed to the dashboard for live monitoring. */
    [WS_EVENTS.LOG_UPDATE]: ({ clientId, data }) => {
        const parsed = LogUpdatePayloadSchema.safeParse(data.payload);
        if (!parsed.success) return;

        ProxyService.broadcastToDashboard({
            type: "LOG_UPDATE",
            payload: { clientId, ...parsed.data },
        });
    },

    /** Delta history the agent collected while it was offline. */
    [WS_EVENTS.SYNC_HISTORY]: ({ clientId, data, log }) => {
        const parsed = SyncHistoryPayloadSchema.safeParse(data.payload);
        if (!parsed.success) {
            log.warn({
                msg: "Invalid SYNC_HISTORY payload",
                errors: parsed.error,
            });
            return;
        }
        const { history } = parsed.data;
        if (!history || !Array.isArray(history)) return;

        try {
            JobHistoryRepository.upsertHistoryBatch(clientId, history);
            log.info({
                msg: "Processed history sync from client",
                clientId,
                count: history.length,
            });
        } catch (err) {
            log.error({ msg: "Failed to process history sync", err });
        }
    },

    /** The agent recalculated when a scheduled job runs next. */
    [WS_EVENTS.JOB_NEXT_RUN_UPDATE]: ({ clientId, data }) => {
        const parsed = JobNextRunUpdatePayloadSchema.safeParse(data.payload);
        if (!parsed.success) return;

        ProxyService.updateJobNextRun(
            clientId,
            parsed.data.jobId,
            parsed.data.nextRunAt,
        );
    },

    /**
     * A tunnel lease request. The client never names a target: jobId (backup) or runId
     * (restore) is resolved server-side into the actual PBS host and port.
     */
    [WS_EVENTS.TUNNEL_ACQUIRE]: ({ clientId, socket, data, log }) =>
        TunnelLease.handleAcquire(clientId, socket, data, log),

    [WS_EVENTS.TUNNEL_RELEASE]: ({ clientId, data }) => {
        const parsed = TunnelReleaseSchema.safeParse(data.payload);
        if (!parsed.success) return;
        TunnelService.release(clientId, parsed.data.leaseId);
    },

    [WS_EVENTS.FINGERPRINT_OBSERVED]: ({ clientId, data, log }) => {
        const parsed = FingerprintObservedSchema.safeParse(data.payload);
        if (!parsed.success) return;
        TunnelLease.recordObservedFingerprint(clientId, parsed.data, log);
    },
};

/**
 * Entry point for every message an authenticated agent sends.
 *
 * `resolvePending` runs first for all of them: it is what replaced the per-request
 * listeners that used to be attached to the socket, and it ignores anything without a
 * matching requestId — so a message can be both an answer and, in principle, a routed
 * event without the two interfering.
 */
export async function routeAgentMessage(
    clientId: string,
    socket: any,
    data: WsMessage,
    log: AgentLogger,
): Promise<void> {
    ProxyService.resolvePending(clientId, data as WsMessage<any>);

    const handler = HANDLERS[data.type];
    if (!handler) return;

    await handler({ clientId, socket, data, log });
}
