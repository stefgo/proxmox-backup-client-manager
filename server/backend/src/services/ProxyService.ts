import { WebSocket } from "ws";
import crypto, { randomUUID } from "crypto";
import {
    WS_EVENTS,
    CLIENT_STATUS,
    CONNECTION_MODE,
    WsMessage,
    ProtocolMap,
    BackupJob,
    WS_REQUEST_TIMEOUT_MS,
    WS_REQUEST_TIMEOUT_DEFAULT_MS,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import { TunnelService } from "./TunnelService.js";

/** One outstanding request to an agent, keyed by its requestId. */
interface PendingRequest {
    clientId: string;
    type: string;
    resolve: (payload: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

export class ProxyService {
    private static connectedClients = new Map<string, WebSocket>();
    private static dashboardClients = new Set<WebSocket>();
    private static jobCache = new Map<string, BackupJob[]>();
    /**
     * Correlation table for requests the server sent to agents.
     *
     * Replaces one `socket.on("message", …)` listener per outstanding request. That shape
     * worked, but it scaled the wrong way: eleven concurrent requests to one agent
     * tripped Node's MaxListenersExceededWarning, and every message arriving on that
     * socket was JSON.parse'd once per attached listener.
     *
     * This is the mirror image of Connection.request/resolvePending in the agent, which
     * has always been built this way.
     */
    private static pending = new Map<string, PendingRequest>();

    static registerClient(clientId: string, socket: WebSocket) {
        const existing = this.connectedClients.get(clientId);
        if (existing) {
            existing.close(4000, "Replaced by new connection");
        }
        this.connectedClients.set(clientId, socket);
        // Refresh job cache asynchronously when client connects
        this.refreshJobCache(clientId).catch((e) => {
            logger.error(
                { err: e, clientId },
                "Failed to fetch initial job list on connect",
            );
        });
    }

    static unregisterClient(clientId: string, socket: WebSocket) {
        if (this.connectedClients.get(clientId) === socket) {
            this.connectedClients.delete(clientId);
            this.jobCache.delete(clientId);
            // The cache is the only source /api/v1/jobs has, so an emptied entry has to
            // reach the dashboards too -- otherwise they keep showing jobs that a reload
            // would no longer return.
            this.broadcastJobs(clientId, []);
            // The agent is gone, so no answer is coming. Failing the callers now beats
            // leaving each of them to discover it separately when its timeout expires.
            this.rejectPendingFor(clientId, "Client disconnected");
            // A client that is gone cannot release its leases any more — drop them here,
            // otherwise the tunnel would stay open until maxLeaseMs.
            TunnelService.dropClientLeases(clientId);
        }
    }

    static addDashboardClient(socket: WebSocket) {
        this.dashboardClients.add(socket);
    }

    static removeDashboardClient(socket: WebSocket) {
        this.dashboardClients.delete(socket);
    }

    static async refreshJobCache(clientId: string) {
        try {
            const payload = await this.sendRequest(
                clientId,
                WS_EVENTS.JOB_LIST_CONFIG,
                { requestId: randomUUID() },
            );
            this.jobCache.set(clientId, payload.jobs);
            await this.backfillRepositoryIds(clientId, payload.jobs);
            // After the backfill, so the broadcast carries the same rows a fetch would.
            // This is the only notification the dashboards get about the job cache: it
            // fills on connect, and a dashboard that was already open would otherwise
            // keep the empty list it fetched while the client was still offline.
            this.broadcastJobs(clientId, this.jobCache.get(clientId) ?? []);
        } catch (e: unknown) {
            logger.error(
                { clientId, err: e instanceof Error ? e.message : String(e) },
                "Failed to refresh job cache for client",
            );
        }
    }

    /** One client's cached job list, in the shape a `GET /api/v1/jobs` entry has. */
    private static broadcastJobs(clientId: string, jobs: BackupJob[]) {
        this.broadcastToDashboard({
            type: "JOBS_UPDATE",
            payload: { clientId, jobs },
        });
    }

    static updateJobNextRun(
        clientId: string,
        jobId: string,
        nextRunAt: string | null,
    ) {
        const jobs = this.jobCache.get(clientId);
        if (jobs) {
            const index = jobs.findIndex((j) => j.id === jobId);
            if (index !== -1) {
                jobs[index] = {
                    ...jobs[index],
                    nextRunAt: nextRunAt || undefined,
                };
                this.jobCache.set(clientId, jobs);
            }
        }

        // Broadcast to dashboard
        this.broadcastToDashboard({
            type: "JOB_NEXT_RUN_UPDATE",
            payload: { clientId, jobId, nextRunAt },
        });
    }

    /**
     * Stamps the repository id onto jobs that predate it.
     *
     * Jobs carry an anonymous copy of the repository, so without an id nothing can tell
     * which managed repository a job belongs to. Runs on every cache refresh, i.e. on
     * every client connect, and goes idle once every job has been stamped. The cached
     * entries are patched in place rather than triggering another refresh, which would
     * recurse.
     */
    private static async backfillRepositoryIds(
        clientId: string,
        jobs: BackupJob[],
    ): Promise<void> {
        const pending = jobs.filter(
            (j) => j.id && j.repository && !j.repository.repositoryId,
        );
        if (pending.length === 0) return;

        const repositories = RepositoryConfigRepository.findAll();

        for (const job of pending) {
            const matches = repositories.filter(
                (r) =>
                    r.base_url === job.repository.baseUrl &&
                    r.datastore === job.repository.datastore,
            );

            if (matches.length !== 1) {
                logger.warn(
                    {
                        clientId,
                        jobId: job.id,
                        baseUrl: job.repository.baseUrl,
                        candidates: matches.length,
                    },
                    matches.length === 0
                        ? "Backfill skipped: no repository matches this job"
                        : "Backfill skipped: repository is ambiguous for this job",
                );
                continue;
            }

            const patched = {
                ...job,
                repository: {
                    ...job.repository,
                    repositoryId: matches[0].id,
                },
            };

            try {
                const result = await this.sendRequest(
                    clientId,
                    WS_EVENTS.JOB_SAVE_CONFIG,
                    { requestId: randomUUID(), job: patched },
                );
                if (result.success) {
                    job.repository.repositoryId = matches[0].id;
                    logger.info(
                        { clientId, jobId: job.id, repositoryId: matches[0].id },
                        "Backfilled repository id for job",
                    );
                } else {
                    logger.warn(
                        { clientId, jobId: job.id, error: result.error },
                        "Backfill of repository id was rejected by the client",
                    );
                }
            } catch (e: unknown) {
                logger.warn(
                    {
                        clientId,
                        jobId: job.id,
                        err: e instanceof Error ? e.message : String(e),
                    },
                    "Backfill of repository id failed",
                );
            }
        }
    }

    static getAllCachedJobs(): { clientId: string; jobs: BackupJob[] }[] {
        const result: { clientId: string; jobs: BackupJob[] }[] = [];
        for (const [clientId, jobs] of this.jobCache.entries()) {
            result.push({ clientId, jobs });
        }
        return result;
    }

    /** Single cached job of a client — used to resolve tunnel targets server-side. */
    static getCachedJob(clientId: string, jobId: string): BackupJob | undefined {
        return this.jobCache.get(clientId)?.find((j) => j.id === jobId);
    }

    static getClientSocket(clientId: string): WebSocket | undefined {
        return this.connectedClients.get(clientId);
    }

    static getClientsWithStatus() {
        const clients = ClientRepository.findAll();
        // Read once for the whole list rather than per client: this runs on every
        // dashboard broadcast.
        const configured = new Set(ClientTunnelRepository.findAllClientIds());
        return clients.map((client) => ({
            id: client.id,
            hostname: client.hostname,
            displayName: client.display_name,
            status: this.connectedClients.has(client.id)
                ? CLIENT_STATUS.ONLINE
                : CLIENT_STATUS.OFFLINE,
            lastSeen: client.last_seen,
            ipAddress: client.ip_address,
            version: client.version,
            connectionMode: client.connection_mode || CONNECTION_MODE.INBOUND,
            outboundTargetAddress: client.outbound_target_address,
            inboundAllowedIp: client.inbound_allowed_ip,
            // Keyed on the tunnel itself, not on the connection mode: a tunnel is optional
            // in either mode, so an inbound client can have one and an outbound one can do
            // without. Whether a given run takes it is the job's own setting.
            tunnelConfigured: configured.has(client.id),
            tunnel: configured.has(client.id)
                ? TunnelService.getStatus(client.id)
                : undefined,
            createdAt: client.created_at,
            updatedAt: client.updated_at,
        }));
    }

    static updateClient(
        id: string,
        data: {
            displayName?: string;
            outboundTargetAddress?: string;
            /** `null` switches the check off; absent leaves the stored value alone. */
            inboundAllowedIp?: string | null;
        },
    ) {
        let changed = false;

        if (data.displayName !== undefined) {
            const info = ClientRepository.updateDisplayName(
                id,
                data.displayName,
            );
            changed = changed || info.changes > 0;
        }

        if (data.outboundTargetAddress !== undefined) {
            const info = ClientRepository.updateOutboundTargetAddress(
                id,
                data.outboundTargetAddress,
            );
            changed = changed || info.changes > 0;
        }

        if (data.inboundAllowedIp !== undefined) {
            const info = ClientRepository.updateInboundAllowedIp(
                id,
                data.inboundAllowedIp,
            );
            changed = changed || info.changes > 0;
        }

        if (changed) this.broadcastClientUpdate();
        return changed;
    }

    /**
     * Drops the agent connection so it is rebuilt from the current database row — used
     * after the target address changed, where the open socket still points at the old
     * endpoint.
     */
    static disconnectClient(clientId: string, reason: string): void {
        const socket = this.connectedClients.get(clientId);
        if (!socket) return;
        logger.info({ clientId, reason }, "ProxyService: dropping agent connection");
        socket.close(4000, reason);
    }

    /**
     * Broadcasts the complete list of registered clients and their online status
     * to all active dashboard WebSocket sessions.
     */
    static broadcastClientUpdate() {
        try {
            // Serialised once. This used to stringify, parse the result straight back,
            // and hand the object to broadcastToDashboard — which stringified it again:
            // three passes over the full client list on every connect and disconnect.
            this.broadcastToDashboard(
                JSON.stringify({
                    type: "CLIENTS_UPDATE",
                    payload: this.getClientsWithStatus(),
                }),
            );
        } catch (e) {
            logger.error({ err: e }, "Broadcast error");
        }
    }

    static broadcastToDashboard(message: any) {
        const msgStr =
            typeof message === "string" ? message : JSON.stringify(message);
        // Multicast message to all connected dashboard sessions
        for (const client of this.dashboardClients) {
            if (client.readyState === client.OPEN) {
                client.send(msgStr);
            }
        }
    }

    /**
     * Sends an asynchronous, typed request to a specific client agent via WebSocket.
     * Automatically generates a unique requestId and waits for the correlating response.
     * Times out if the client does not respond within 5 seconds.
     *
     * @param clientId - The target agent's UUID
     * @param type - The exact event type from WS_EVENTS
     * @param payload - The payload matching the specific event protocol
     */
    static async sendRequest<K extends keyof ProtocolMap>(
        clientId: string,
        type: K,
        payload: ProtocolMap[K]["req"],
    ): Promise<ProtocolMap[K]["res"]> {
        const socket = this.connectedClients.get(clientId);
        if (!socket) {
            throw new Error("Client not connected");
        }

        // Generate a unique Request ID to correlate the async response from the client.
        // Narrowed rather than cast: only some entries of ProtocolMap carry a requestId,
        // and a caller that already made one (JOB_SAVE_CONFIG does) keeps it.
        const existingId =
            payload && typeof payload === "object" && "requestId" in payload
                ? payload.requestId
                : undefined;
        const requestId =
            typeof existingId === "string" ? existingId : randomUUID();
        // Ensure payload has requestId
        const finalPayload = { ...payload, requestId };

        const timeoutMs =
            WS_REQUEST_TIMEOUT_MS[type as string] ??
            WS_REQUEST_TIMEOUT_DEFAULT_MS;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`Timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(requestId, {
                clientId,
                type: type as string,
                resolve,
                reject,
                timer,
            });

            try {
                socket.send(JSON.stringify({ type, payload: finalPayload }));
            } catch (e) {
                // A send that throws leaves an entry nobody will ever answer.
                clearTimeout(timer);
                this.pending.delete(requestId);
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    }

    /**
     * Hands an agent's answer to whoever is waiting for it.
     *
     * Called from WebSocketController for every message an authenticated agent sends;
     * anything without a matching requestId is not a response and is ignored here.
     */
    static resolvePending(clientId: string, data: WsMessage<any>): void {
        const requestId = data?.payload?.requestId;
        if (typeof requestId !== "string") return;

        const entry = this.pending.get(requestId);
        if (!entry) return;

        // The id is a UUID, so a collision across clients is not a practical concern —
        // but answering one client's request with another's reply would be silent and
        // very hard to trace, so the pairing is checked rather than assumed.
        if (entry.clientId !== clientId || entry.type !== data.type) return;

        this.pending.delete(requestId);
        clearTimeout(entry.timer);

        if (data.payload.error) {
            entry.reject(new Error(data.payload.error));
        } else {
            entry.resolve(data.payload);
        }
    }

    /**
     * Fails every request outstanding for a client. Called when its socket closes: those
     * answers are never coming, and without this each one sat until its own timeout.
     */
    private static rejectPendingFor(clientId: string, reason: string): void {
        for (const [requestId, entry] of [...this.pending.entries()]) {
            if (entry.clientId !== clientId) continue;
            this.pending.delete(requestId);
            clearTimeout(entry.timer);
            entry.reject(new Error(reason));
        }
    }

    /**
     * Sends a one-way message to a client agent without waiting for a response.
     * Primarily used for 'fire-and-forget' manual triggers (e.g. starting a backup).
     */
    static sendFireAndForget(clientId: string, type: string, payload: any) {
        const socket = this.connectedClients.get(clientId);
        if (!socket) throw new Error("Client not connected");
        socket.send(JSON.stringify({ type, payload }));
    }

}
