import net from "net";
import crypto, { randomUUID } from "crypto";
import { Client as SshClient } from "ssh2";
import type { TunnelState, TunnelStatus } from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { appConfig } from "../config/AppConfig.js";
import {
    ClientTunnelRepository,
    TunnelCredentials,
} from "../repositories/ClientTunnelRepository.js";
import { ProxyService } from "./ProxyService.js";

export interface TunnelTarget {
    host: string;
    port: number;
}

export interface SshTestParams {
    sshHost: string;
    sshPort?: number;
    sshUser: string;
    privateKey: string;
    passphrase?: string;
    /** When set, the host key must match — otherwise it is only reported back. */
    expectedHostKeySha256?: string;
    remoteBindHost?: string;
}

export interface SshTestResult {
    ok: boolean;
    hostKeySha256?: string;
    boundPort?: number;
    error?: string;
}

interface Forward {
    /** Port the sshd allocated on the client host — only valid for this connection. */
    port: number;
    bindHost: string;
    target: TunnelTarget;
    leases: Set<string>;
}

interface Lease {
    clientId: string;
    targetKey: string;
    runId: string;
    jobId?: string;
    startedAt: number;
    timer: NodeJS.Timeout;
}

interface TunnelEntry {
    ssh: SshClient | null;
    /** Shared between concurrent acquires so a second caller never opens a second connection. */
    connectPromise: Promise<SshClient> | null;
    forwards: Map<string, Forward>;
    /** Shared per target, same reasoning as connectPromise. */
    forwardPromises: Map<string, Promise<Forward>>;
    status: TunnelStatus;
    idleTimer: NodeJS.Timeout | null;
    lastRequestAt: number;
    lastError: string | null;
    /**
     * Whether this client currently occupies one of the maxConcurrentTunnels slots.
     *
     * The occupancy used to be derived by counting entries with `ssh || connectPromise`,
     * which had a gap: the async IIFE in connectShared() is only assigned to
     * `connectPromise` *after* its expression is evaluated, so during its own first
     * `await` the connection it is opening was not counted yet. Two concurrent acquires
     * for different clients could therefore both pass the limit check.
     *
     * A flag rather than a bare counter, because four different paths tear a connection
     * down — the connect error, connection loss, the idle teardown and closeClient — and
     * every one of them must give the slot back exactly once.
     */
    holdsSlot: boolean;
}

const targetKeyOf = (t: TunnelTarget) => `${t.host}:${t.port}`;

export class TunnelService {
    private static tunnels = new Map<string, TunnelEntry>();
    private static leases = new Map<string, Lease>();
    /** Slots currently held. Authoritative — never recomputed from the entries. */
    private static openConnections = 0;
    /** Restore runs carry no jobId, so the server pre-authorises their target by runId. */
    private static pendingRunTargets = new Map<
        string,
        { clientId: string; target: TunnelTarget; expiresAt: number }
    >();
    private static waiting: {
        resolve: () => void;
        reject: (e: Error) => void;
        timer: NodeJS.Timeout;
    }[] = [];

    private static cfg() {
        return appConfig.tunnel;
    }

    // ---------------------------------------------------------------- helpers

    private static entry(clientId: string): TunnelEntry {
        let e = this.tunnels.get(clientId);
        if (!e) {
            e = {
                ssh: null,
                connectPromise: null,
                forwards: new Map(),
                forwardPromises: new Map(),
                status: "idle",
                idleTimer: null,
                lastRequestAt: 0,
                lastError: null,
                holdsSlot: false,
            };
            this.tunnels.set(clientId, e);
        }
        return e;
    }

    private static setStatus(
        clientId: string,
        status: TunnelStatus,
        error?: string | null,
    ) {
        const e = this.entry(clientId);
        e.status = status;
        if (error !== undefined) e.lastError = error;
        this.broadcast(clientId);
    }

    private static broadcast(clientId: string) {
        try {
            ProxyService.broadcastToDashboard({
                type: "TUNNEL_UPDATE",
                payload: this.getStatus(clientId),
            });
        } catch (e) {
            logger.debug({ err: e }, "TunnelService: broadcast failed");
        }
    }

    /**
     * Takes one of the maxConcurrentTunnels slots for this client, waiting if none is
     * free. Queueing rather than rejecting: many clients share the same cron schedule and
     * would otherwise all fail at once instead of simply running a few seconds later.
     *
     * The check and the reservation happen together, before this function awaits
     * anything. That ordering is the whole point — a counter incremented after
     * `await openSsh()` would leave exactly the gap this replaces.
     *
     * A client that already holds a slot does not take a second one; concurrent acquires
     * for the same client share one connection anyway (connectPromise).
     */
    private static async acquireSlot(clientId: string): Promise<void> {
        const e = this.entry(clientId);
        if (e.holdsSlot) return;

        if (this.openConnections < this.cfg().maxConcurrentTunnels) {
            this.openConnections++;
            e.holdsSlot = true;
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this.waiting.findIndex((w) => w.timer === timer);
                if (idx >= 0) this.waiting.splice(idx, 1);
                reject(
                    new Error(
                        "Too many concurrent tunnels — timed out waiting for a slot",
                    ),
                );
            }, this.cfg().acquireTimeoutMs);
            this.waiting.push({ resolve, reject, timer });
        });

        // Woken by releaseSlot(), which handed its slot straight over — openConnections
        // was never decremented for it, so there is nothing to increment here.
        //
        // The entry is looked up again rather than reusing `e`: closeClient() may have
        // removed this client while we waited, and marking a detached object as holding
        // a slot would occupy it for the life of the process with nothing left to release
        // it.
        const live = this.tunnels.get(clientId);
        if (!live) {
            this.openConnections--;
            this.wakeNextWaiter();
            throw new Error("Tunnel was closed while waiting for a slot");
        }
        live.holdsSlot = true;
    }

    /** Hands a free slot to the next waiter, or leaves it free if nobody is queued. */
    private static wakeNextWaiter(): boolean {
        const next = this.waiting.shift();
        if (!next) return false;
        clearTimeout(next.timer);
        next.resolve();
        return true;
    }

    /**
     * Gives this client's slot back, if it holds one.
     *
     * Guarded by holdsSlot because four paths can lead here for the same connection: the
     * failed connect, connection loss, the idle teardown and closeClient. Without the
     * guard the ones that overlap would release twice and inflate the effective limit.
     *
     * A waiting caller is handed the slot directly instead of the counter being
     * decremented and re-checked, so a third caller cannot slip in between.
     */
    private static releaseSlot(clientId: string) {
        const e = this.tunnels.get(clientId);
        if (!e?.holdsSlot) return;
        e.holdsSlot = false;

        // Handed over directly rather than decremented and re-checked, so a third caller
        // cannot slip into the slot between the two steps.
        if (!this.wakeNextWaiter()) this.openConnections--;
    }

    // ---------------------------------------------------------- ssh machinery

    private static fingerprintOf(key: Buffer): string {
        return crypto.createHash("sha256").update(key).digest("base64");
    }

    /**
     * Opens the SSH connection for a client. Never call directly — go through
     * connectShared() so concurrent callers share one connection.
     */
    private static openSsh(
        creds: TunnelCredentials,
        expectedHostKey: string | undefined,
    ): Promise<SshClient> {
        return new Promise((resolve, reject) => {
            const ssh = new SshClient();
            let settled = false;

            const fail = (err: Error) => {
                if (settled) return;
                settled = true;
                try {
                    ssh.end();
                } catch {
                    /* already gone */
                }
                reject(err);
            };

            ssh.on("ready", () => {
                if (settled) return;
                settled = true;
                resolve(ssh);
            });

            ssh.on("error", (err) => fail(err as Error));

            ssh.connect({
                host: creds.sshHost,
                port: creds.sshPort,
                username: creds.sshUser,
                privateKey: creds.privateKey,
                passphrase: creds.passphrase,
                keepaliveInterval: this.cfg().keepaliveIntervalMs,
                readyTimeout: this.cfg().connectTimeoutMs,
                hostVerifier: (key: Buffer) => {
                    const fp = this.fingerprintOf(key);
                    if (!expectedHostKey) return true;
                    if (fp !== expectedHostKey) {
                        logger.error(
                            { expected: expectedHostKey, actual: fp },
                            "TunnelService: host key mismatch",
                        );
                        return false;
                    }
                    return true;
                },
            });
        });
    }

    private static connectShared(
        clientId: string,
        creds: TunnelCredentials,
    ): Promise<SshClient> {
        const e = this.entry(clientId);
        if (e.ssh) return Promise.resolve(e.ssh);
        if (e.connectPromise) return e.connectPromise;

        this.setStatus(clientId, "connecting");

        e.connectPromise = (async () => {
            await this.acquireSlot(clientId);
            const ssh = await this.openSsh(creds, creds.hostKeySha256);

            ssh.on("close", () => this.handleConnectionLost(clientId));
            ssh.on("end", () => this.handleConnectionLost(clientId));
            this.attachForwardHandler(clientId, ssh);

            e.ssh = ssh;
            e.connectPromise = null;
            this.setStatus(clientId, "up", null);
            return ssh;
        })().catch((err) => {
            e.connectPromise = null;
            e.ssh = null;
            // A connect that failed still holds the slot it reserved above. Without this
            // the next caller waited out acquireTimeoutMs for a slot that was already
            // free in every sense but the bookkeeping.
            this.releaseSlot(clientId);
            const raw = err instanceof Error ? err.message : String(err);
            const message = raw.slice(0, 500);
            this.setStatus(clientId, "error", message);
            throw err;
        });

        return e.connectPromise;
    }

    /**
     * Opens a reverse forward for one target. Port 0 lets the sshd pick a free port;
     * the returned value is the only authoritative port for this forward.
     */
    private static forwardShared(
        clientId: string,
        ssh: SshClient,
        bindHost: string,
        target: TunnelTarget,
    ): Promise<Forward> {
        const e = this.entry(clientId);
        const key = targetKeyOf(target);

        const existing = e.forwards.get(key);
        if (existing) return Promise.resolve(existing);

        const pending = e.forwardPromises.get(key);
        if (pending) return pending;

        const promise = new Promise<Forward>((resolve, reject) => {
            ssh.forwardIn(bindHost, 0, (err, port) => {
                if (err) {
                    reject(
                        new Error(
                            `Reverse forward rejected (${err.message}) — check AllowTcpForwarding and permitlisten on the client host`,
                        ),
                    );
                    return;
                }
                const forward: Forward = {
                    port,
                    bindHost,
                    target,
                    leases: new Set(),
                };
                e.forwards.set(key, forward);
                logger.info(
                    { clientId, port, target: key },
                    "TunnelService: reverse forward established",
                );
                resolve(forward);
            });
        })
            .finally(() => {
                e.forwardPromises.delete(key);
            });

        e.forwardPromises.set(key, promise);
        return promise;
    }

    /**
     * Wires incoming tunnel connections to the PBS. One listener per SSH connection;
     * the bound port tells us which target the client asked for.
     */
    private static attachForwardHandler(clientId: string, ssh: SshClient) {
        ssh.on("tcp connection", (info, accept, reject) => {
            const e = this.tunnels.get(clientId);
            const forward = e
                ? [...e.forwards.values()].find((f) => f.port === info.destPort)
                : undefined;

            if (!forward) {
                logger.warn(
                    { clientId, port: info.destPort },
                    "TunnelService: connection on unknown forward, rejected",
                );
                reject();
                return;
            }

            const stream = accept();
            const upstream = net.connect(
                forward.target.port,
                forward.target.host,
            );

            const cleanup = () => {
                stream.unpipe(upstream);
                upstream.unpipe(stream);
                try {
                    stream.end();
                } catch {
                    /* ignore */
                }
                try {
                    upstream.destroy();
                } catch {
                    /* ignore */
                }
            };

            upstream.on("connect", () => {
                stream.pipe(upstream);
                upstream.pipe(stream);
            });
            upstream.on("error", (err) => {
                logger.warn(
                    { clientId, err: err.message, target: targetKeyOf(forward.target) },
                    "TunnelService: upstream connection failed",
                );
                cleanup();
            });
            upstream.on("close", cleanup);
            stream.on("error", cleanup);
            stream.on("close", cleanup);
        });
    }

    /**
     * A dropped connection invalidates every lease: the next connection gets different
     * ports, so a running job would talk to a port that no longer exists.
     */
    private static handleConnectionLost(clientId: string) {
        const e = this.tunnels.get(clientId);
        if (!e || (!e.ssh && !e.connectPromise)) return;

        logger.warn({ clientId }, "TunnelService: ssh connection lost, dropping leases");
        e.ssh = null;
        e.forwards.clear();
        e.forwardPromises.clear();
        this.dropClientLeases(clientId);
        this.setStatus(clientId, "idle");
        this.releaseSlot(clientId);
    }

    // ------------------------------------------------------------ public API

    /** Pre-authorises a restore target: the client may later acquire a tunnel for this runId. */
    static registerRunTarget(
        clientId: string,
        runId: string,
        target: TunnelTarget,
    ) {
        this.pendingRunTargets.set(runId, {
            clientId,
            target,
            expiresAt: Date.now() + this.cfg().maxLeaseMs,
        });
    }

    static resolveRunTarget(
        clientId: string,
        runId: string,
    ): TunnelTarget | undefined {
        const entry = this.pendingRunTargets.get(runId);
        if (!entry) return undefined;
        if (entry.clientId !== clientId) return undefined;
        if (entry.expiresAt < Date.now()) {
            this.pendingRunTargets.delete(runId);
            return undefined;
        }
        return entry.target;
    }

    /**
     * Grants a tunnel lease. The caller must have resolved the target server-side —
     * the requesting client never names a host or port.
     */
    static async acquire(
        clientId: string,
        target: TunnelTarget,
        runId: string,
        jobId?: string,
    ): Promise<{ leaseId: string; bindHost: string; bindPort: number }> {
        if (!this.cfg().enabled) {
            throw new Error("Tunnel-Funktion ist serverseitig deaktiviert");
        }

        const e = this.entry(clientId);
        const now = Date.now();
        if (now - e.lastRequestAt < this.cfg().minRequestIntervalMs) {
            logger.warn(
                { clientId, runId },
                "TunnelService: request rate limit hit",
            );
            throw new Error("Zu viele Tunnel-Anforderungen in kurzer Zeit");
        }
        e.lastRequestAt = now;

        const creds = ClientTunnelRepository.findCredentials(clientId);
        if (!creds) {
            throw new Error("No SSH tunnel is configured for this client");
        }

        if (e.idleTimer) {
            clearTimeout(e.idleTimer);
            e.idleTimer = null;
        }

        const ssh = await this.connectShared(clientId, creds);
        const forward = await this.forwardShared(
            clientId,
            ssh,
            creds.remoteBindHost,
            target,
        );

        const leaseId = randomUUID();
        const timer = setTimeout(() => {
            logger.warn(
                { clientId, leaseId },
                "TunnelService: lease exceeded maxLeaseMs, releasing",
            );
            this.release(clientId, leaseId);
        }, this.cfg().maxLeaseMs);

        this.leases.set(leaseId, {
            clientId,
            targetKey: targetKeyOf(target),
            runId,
            jobId,
            startedAt: now,
            timer,
        });
        forward.leases.add(leaseId);

        ClientTunnelRepository.recordUse(clientId);
        this.setStatus(clientId, "up", null);

        logger.info(
            { clientId, leaseId, runId, jobId, target: targetKeyOf(target), port: forward.port },
            "TunnelService: lease granted",
        );

        return {
            leaseId,
            bindHost: creds.remoteBindHost,
            bindPort: forward.port,
        };
    }

    static release(clientId: string, leaseId: string): void {
        const lease = this.leases.get(leaseId);
        if (!lease || lease.clientId !== clientId) return;

        clearTimeout(lease.timer);
        this.leases.delete(leaseId);
        this.pendingRunTargets.delete(lease.runId);

        const e = this.tunnels.get(clientId);
        if (!e) return;

        const forward = e.forwards.get(lease.targetKey);
        if (forward) {
            forward.leases.delete(leaseId);
        }

        logger.info(
            { clientId, leaseId, durationMs: Date.now() - lease.startedAt },
            "TunnelService: lease released",
        );

        this.scheduleIdleTeardown(clientId);
        this.broadcast(clientId);
    }

    /**
     * Closes forwards without leases after the grace period, and the SSH connection
     * once no forward is left. The grace avoids churn between consecutive jobs.
     */
    private static scheduleIdleTeardown(clientId: string) {
        const e = this.tunnels.get(clientId);
        if (!e) return;

        if (e.idleTimer) clearTimeout(e.idleTimer);
        e.idleTimer = setTimeout(() => {
            e.idleTimer = null;
            const current = this.tunnels.get(clientId);
            if (!current || !current.ssh) return;

            for (const [key, forward] of [...current.forwards.entries()]) {
                if (forward.leases.size > 0) continue;
                try {
                    current.ssh.unforwardIn(
                        forward.bindHost,
                        forward.port,
                        () => undefined,
                    );
                } catch {
                    /* connection may already be gone */
                }
                current.forwards.delete(key);
            }

            if (current.forwards.size === 0) {
                logger.info({ clientId }, "TunnelService: closing idle ssh connection");
                const ssh = current.ssh;
                current.ssh = null;
                try {
                    ssh.end();
                } catch {
                    /* ignore */
                }
                this.setStatus(clientId, "idle");
                this.releaseSlot(clientId);
            } else {
                this.broadcast(clientId);
            }
        }, this.cfg().idleGraceMs);
    }

    /** Drops all leases of a client — used on WS disconnect and on connection loss. */
    static dropClientLeases(clientId: string): void {
        let dropped = 0;
        for (const [leaseId, lease] of [...this.leases.entries()]) {
            if (lease.clientId !== clientId) continue;
            clearTimeout(lease.timer);
            this.leases.delete(leaseId);
            dropped++;
        }
        const e = this.tunnels.get(clientId);
        if (e) {
            for (const forward of e.forwards.values()) forward.leases.clear();
        }
        if (dropped > 0) {
            logger.info({ clientId, dropped }, "TunnelService: dropped leases");
            this.scheduleIdleTeardown(clientId);
        }
    }

    /** Tears everything down for one client — used when the client is deleted. */
    static closeClient(clientId: string): void {
        this.dropClientLeases(clientId);
        const e = this.tunnels.get(clientId);
        if (!e) return;

        if (e.idleTimer) clearTimeout(e.idleTimer);
        if (e.ssh) {
            try {
                e.ssh.end();
            } catch {
                /* ignore */
            }
        }
        // Before the entry is dropped: releaseSlot reads holdsSlot off it, so deleting
        // first would silently keep the slot occupied for the life of the process.
        this.releaseSlot(clientId);
        this.tunnels.delete(clientId);
    }

    static getStatus(clientId: string): TunnelState {
        const e = this.tunnels.get(clientId);
        const row = ClientTunnelRepository.findByClientId(clientId);
        const forwards = e
            ? [...e.forwards.values()].map((f) => ({
                  target: targetKeyOf(f.target),
                  port: f.port,
              }))
            : [];
        let activeLeases = 0;
        for (const lease of this.leases.values()) {
            if (lease.clientId === clientId) activeLeases++;
        }

        return {
            clientId,
            status: e?.status ?? "idle",
            activeLeases,
            forwards,
            lastUsedAt: row?.last_used_at ?? null,
            lastError: e?.lastError ?? null,
        };
    }

    /**
     * Verifies SSH reachability, credentials and that a reverse forward is permitted.
     * Deliberately does NOT touch any PBS: whether the server reaches a backup server is
     * a property of the repository (see RepositoryController), not of this client.
     */
    static async testConnection(params: SshTestParams): Promise<SshTestResult> {
        let ssh: SshClient | null = null;
        let hostKey: string | undefined;

        try {
            ssh = await new Promise<SshClient>((resolve, reject) => {
                const client = new SshClient();
                let settled = false;

                client.on("ready", () => {
                    if (settled) return;
                    settled = true;
                    resolve(client);
                });
                client.on("error", (err) => {
                    if (settled) return;
                    settled = true;
                    try {
                        client.end();
                    } catch {
                        /* ignore */
                    }
                    reject(err);
                });

                client.connect({
                    host: params.sshHost,
                    port: params.sshPort ?? 22,
                    username: params.sshUser,
                    privateKey: params.privateKey,
                    passphrase: params.passphrase,
                    readyTimeout: this.cfg().connectTimeoutMs,
                    hostVerifier: (key: Buffer) => {
                        hostKey = this.fingerprintOf(key);
                        if (!params.expectedHostKeySha256) return true;
                        return hostKey === params.expectedHostKeySha256;
                    },
                });
            });

            const boundPort = await new Promise<number>((resolve, reject) => {
                ssh!.forwardIn(
                    params.remoteBindHost ?? this.cfg().remoteBindHost,
                    0,
                    (err, port) => {
                        if (err) {
                            reject(
                                new Error(
                                    `Reverse forward rejected (${err.message}) — check AllowTcpForwarding and permitlisten`,
                                ),
                            );
                            return;
                        }
                        resolve(port);
                    },
                );
            });

            return { ok: true, hostKeySha256: hostKey, boundPort };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return {
                ok: false,
                hostKeySha256: hostKey,
                error:
                    params.expectedHostKeySha256 &&
                    hostKey &&
                    hostKey !== params.expectedHostKeySha256
                        ? "Host key does not match the stored fingerprint"
                        : message,
            };
        } finally {
            if (ssh) {
                try {
                    ssh.end();
                } catch {
                    /* ignore */
                }
            }
        }
    }

    static shutdown(): void {
        logger.info("TunnelService: closing all tunnels");
        for (const clientId of [...this.tunnels.keys()]) {
            this.closeClient(clientId);
        }
    }
}
