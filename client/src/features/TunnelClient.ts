import net from "net";
import { WS_EVENTS } from "@pbcm/shared";
import { config, isOutboundMode } from "../core/Config.js";
import { Connection } from "../core/Connection.js";
import { logger } from "../core/logger.js";

export interface TunnelLease {
    leaseId: string;
    bindHost: string;
    bindPort: number;
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
     * Verifies that the job's tunnel expectation matches this agent's connection mode.
     * Catches a client config copied from one host to another, where the stored jobs
     * would otherwise silently target the wrong path to the PBS.
     */
    static assertModeMatches(tunnelRequired: boolean): void {
        const outbound = isOutboundMode();
        if (tunnelRequired && !outbound) {
            throw new Error(
                "Job erwartet einen SSH-Tunnel, dieser Client läuft aber im Direktmodus",
            );
        }
        if (!tunnelRequired && outbound) {
            throw new Error(
                "Client läuft im Tunnelmodus, der Job ist aber ohne Tunnel konfiguriert",
            );
        }
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
                "SSH-Tunnel nicht verfügbar: keine Serververbindung",
            );
        }

        const result = await Connection.request(
            WS_EVENTS.TUNNEL_ACQUIRE,
            { runId, jobId },
            ACQUIRE_TIMEOUT_MS,
        );

        if (!result.granted || !result.leaseId || !result.bindPort) {
            throw new Error(
                `SSH-Tunnel nicht verfügbar: ${result.error || "Anforderung abgelehnt"}`,
            );
        }

        const lease: TunnelLease = {
            leaseId: result.leaseId,
            bindHost: result.bindHost || "127.0.0.1",
            bindPort: result.bindPort,
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
     */
    static buildRepositoryValue(repo: any, lease?: TunnelLease): string {
        let hostStr = "";
        if (lease) {
            hostStr = `${lease.bindHost}:${lease.bindPort}`;
        } else {
            try {
                const u = new URL(repo.baseUrl);
                hostStr = u.hostname;
                if (u.port) hostStr += ":" + u.port;
            } catch (e) {
                hostStr = repo.baseUrl;
            }
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
                        `SSH-Tunnel nicht erreichbar: Zeitüberschreitung auf ${lease.bindHost}:${lease.bindPort}`,
                    ),
                ),
            );
            socket.on("error", (err) =>
                done(
                    new Error(
                        `SSH-Tunnel nicht erreichbar (${lease.bindHost}:${lease.bindPort}): ${err.message}`,
                    ),
                ),
            );
        });
    }
}
