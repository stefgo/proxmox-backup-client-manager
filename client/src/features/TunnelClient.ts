import net from "net";
import { WS_EVENTS, parseRepositoryEndpoint } from "@pbcm/shared";
import { config } from "../core/Config.js";
import { Connection } from "../core/Connection.js";
import { logger } from "../core/logger.js";
import { AgentStateRepository } from "../repositories/AgentStateRepository.js";

export interface TunnelLease {
    leaseId: string;
    bindHost: string;
    bindPort: number;
    /**
     * Fingerprint to pin for this run, measured by the server. A tunneled run reaches
     * the PBS as 127.0.0.1, so the hostname check can never succeed and this pin is the
     * only trust anchor left — it has to be current, which a stored copy would not be.
     */
    fingerprint?: string;
}

/**
 * Client-side timeout for the lease request. Deliberately larger than the server's
 * acquireTimeoutMs (20s by default): the server may legitimately queue a request when
 * maxConcurrentTunnels is reached, and giving up first would leave a lease nobody frees.
 */
const ACQUIRE_TIMEOUT_MS = 25000;
const PREFLIGHT_TIMEOUT_MS = 5000;

export class TunnelClient {
    /**
     * Whether this agent's runs go through the SSH reverse tunnel.
     *
     * Deliberately unrelated to `isOutboundMode()`: that answers who dials the
     * WebSocket, this answers how the PBS is reached, and the two are independent. The
     * value is the server's to decide — it arrives in AUTH_SUCCESS and via TUNNEL_MODE
     * and is persisted, so a scheduled run while the server is unreachable still uses
     * the route it was last told about.
     */
    static isRequired(): boolean {
        return AgentStateRepository.isTunnelRequired();
    }

    /** Stores what the server just told us. */
    static setRequired(required: boolean): void {
        if (required === this.isRequired()) return;
        AgentStateRepository.setTunnelRequired(required);
        logger.info(
            { tunnelRequired: required },
            "Route to the PBS changed by the server",
        );
    }

    /**
     * Requests a tunnel lease from the server and verifies the forward is usable.
     * The request carries no target: the server derives the PBS endpoint from the job
     * (or, for restores, from the run it authorised earlier).
     */
    static async acquire(runId: string, jobId?: string): Promise<TunnelLease> {
        await this.jitter();

        if (!Connection.isConnected()) {
            throw new Error(
                "SSH tunnel unavailable: no server connection",
            );
        }

        const result = await Connection.request(
            WS_EVENTS.TUNNEL_ACQUIRE,
            { runId, jobId },
            ACQUIRE_TIMEOUT_MS,
        );

        if (!result.granted || !result.leaseId || !result.bindPort) {
            throw new Error(
                `SSH tunnel unavailable: ${result.error || "request rejected"}`,
            );
        }

        const lease: TunnelLease = {
            leaseId: result.leaseId,
            bindHost: result.bindHost || "127.0.0.1",
            bindPort: result.bindPort,
            fingerprint: result.fingerprint,
        };

        // The forward is set up on the far side of the SSH connection, so the listener
        // may not accept connections the instant the lease is granted. Probing here turns
        // a sporadic first-run failure into a clean, explanatory error.
        try {
            await this.preflight(lease);
        } catch (e) {
            // The lease exists on the server from here on. Without this release it would
            // linger until maxLeaseMs and keep the unusable forward alive, so every retry
            // would be handed the very same dead port.
            this.release(lease);
            throw e;
        }
        logger.info(
            `Tunnel lease ${lease.leaseId} active on ${lease.bindHost}:${lease.bindPort}`,
        );
        return lease;
    }

    static release(lease: TunnelLease | undefined): void {
        if (!lease) return;
        try {
            Connection.send(WS_EVENTS.TUNNEL_RELEASE, {
                leaseId: lease.leaseId,
            });
            logger.debug(`Tunnel lease ${lease.leaseId} released`);
        } catch (e) {
            logger.warn({ err: e }, "Failed to release tunnel lease");
        }
    }

    /**
     * Builds the PBS_REPOSITORY value. With a lease, host and port are replaced by the
     * loopback endpoint of the reverse forward — everything else (user, token, datastore)
     * stays untouched, and the stored job keeps the real PBS URL.
     *
     * The port is always spelled out. Omitting it would hand the decision to
     * proxmox-backup-client, which assumes 8007 on its own — and the server resolves the
     * very same URL to the protocol default, so the two would silently disagree about
     * which endpoint the run is talking to.
     */
    static buildRepositoryValue(repo: any, lease?: TunnelLease): string {
        let hostStr = "";
        if (lease) {
            hostStr = `${lease.bindHost}:${lease.bindPort}`;
        } else {
            const endpoint = parseRepositoryEndpoint(repo.baseUrl);
            hostStr = endpoint
                ? `${endpoint.host}:${endpoint.port}`
                : repo.baseUrl;
        }
        return `${repo.username}!${repo.tokenname}@${hostStr}:${repo.datastore}`;
    }

    /** Spreads simultaneous cron starts across a window instead of one single second. */
    private static jitter(): Promise<void> {
        const max = config.tunnelAcquireJitterSeconds ?? 0;
        if (max <= 0) return Promise.resolve();
        const delay = Math.floor(Math.random() * max * 1000);
        if (delay === 0) return Promise.resolve();
        logger.debug(`Waiting ${delay}ms (jitter) before requesting tunnel`);
        return new Promise((resolve) => setTimeout(resolve, delay));
    }

    private static preflight(lease: TunnelLease): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = net.connect(lease.bindPort, lease.bindHost);
            const done = (err?: Error) => {
                socket.removeAllListeners();
                socket.destroy();
                err ? reject(err) : resolve();
            };

            socket.setTimeout(PREFLIGHT_TIMEOUT_MS);
            socket.on("connect", () => done());
            socket.on("timeout", () =>
                done(
                    new Error(
                        `SSH tunnel not reachable: timed out on ${lease.bindHost}:${lease.bindPort}`,
                    ),
                ),
            );
            socket.on("error", (err) =>
                done(
                    new Error(
                        `SSH tunnel not reachable (${lease.bindHost}:${lease.bindPort}): ${err.message}`,
                    ),
                ),
            );
        });
    }
}
