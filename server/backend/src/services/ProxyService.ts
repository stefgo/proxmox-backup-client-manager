import { WebSocket } from "ws";
import crypto, { randomUUID } from "crypto";
import {
    WS_EVENTS,
    CLIENT_STATUS,
    CONNECTION_MODE,
    WsMessage,
    ProtocolMap,
    BackupJob,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import { TunnelService } from "./TunnelService.js";

export class ProxyService {
    private static connectedClients = new Map<string, WebSocket>();
    private static dashboardClients = new Set<WebSocket>();
    private static jobCache = new Map<string, BackupJob[]>();

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
            // Optional: Broadcast a separate JOB cache update if frontend listens for it
        } catch (e: unknown) {
            logger.error(
                { clientId, err: e instanceof Error ? e.message : String(e) },
                "Failed to refresh job cache for client",
            );
        }
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
            const clients = this.getClientsWithStatus();
            const message = JSON.stringify({
                type: "CLIENTS_UPDATE",
                payload: clients,
            });
            this.broadcastToDashboard(JSON.parse(message));
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

        return new Promise((resolve, reject) => {
            // Every exit path runs through cleanup(). Detaching the listener only on
            // success used to leave one behind per timed-out or aborted request, which
            // both grew unboundedly and re-parsed every later message once per corpse.
            const cleanup = () => {
                clearTimeout(timeout);
                socket.off("message", listener);
                socket.off("close", onClose);
            };

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Timeout"));
            }, 5000);

            const onClose = () => {
                cleanup();
                reject(new Error("Client disconnected"));
            };

            const listener = (msg: Buffer) => {
                try {
                    const data = JSON.parse(msg.toString()) as WsMessage<any>;

                    // Check if message matches the expected type and requestId
                    if (
                        data.type === type &&
                        data.payload?.requestId === requestId
                    ) {
                        cleanup();
                        if (data.payload.error) {
                            reject(new Error(data.payload.error));
                        } else {
                            resolve(data.payload as ProtocolMap[K]["res"]);
                        }
                    }
                } catch (e) {}
            };
            socket.on("message", listener);
            socket.on("close", onClose);
            socket.send(JSON.stringify({ type, payload: finalPayload }));
        });
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
