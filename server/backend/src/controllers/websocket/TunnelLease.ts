import {
    WS_EVENTS,
    WsMessage,
    TunnelAcquireSchema,
    parseRepositoryEndpoint,
    normalizeFingerprint,
} from "@pbcm/shared";
import { probeCertificate } from "@pbcm/shared/node";
import { ProxyService } from "../../services/ProxyService.js";
import { TunnelService, type TunnelTarget } from "../../services/TunnelService.js";
import { ClientRepository } from "../../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../../repositories/ClientTunnelRepository.js";
import { RepositoryConfigRepository } from "../../repositories/RepositoryConfigRepository.js";
import { FingerprintObservations } from "../../services/FingerprintObservations.js";
import type { AgentLogger } from "./AgentMessageRouter.js";
import type { HeartbeatSocket } from "./Heartbeat.js";

/**
 * Everything an agent's tunnel request touches, in one module.
 *
 * These four functions used to sit among the connection handshakes in
 * `WebSocketController`. They belong together and apart from those: this is where the
 * security property of the tunnel lives — the tunnel only ever leads to a repository
 * configured on this server, whatever URL the client's job carries. Keeping that reasoning
 * in one file is the point of the split, not the line count.
 */
export class TunnelLease {
    /**
     * Grants or denies a tunnel lease. Everything security relevant happens here:
     * the requested job must belong to the requesting client, and the target is the
     * configured repository the job points at — never a host the client names.
     */
    static async handleAcquire(
        clientId: string,
        socket: HeartbeatSocket,
        data: WsMessage,
        log: AgentLogger,
    ): Promise<void> {
        const parsed = TunnelAcquireSchema.safeParse(data.payload);
        if (!parsed.success) {
            log.warn({ msg: "Invalid TUNNEL_ACQUIRE payload", clientId });
            return;
        }
        const { requestId, runId, jobId } = parsed.data;

        const deny = (error: string) => {
            log.warn({
                msg: "Tunnel request denied",
                clientId,
                runId,
                jobId,
                error,
            });
            socket.send(
                JSON.stringify({
                    type: WS_EVENTS.TUNNEL_ACQUIRE_RESULT,
                    payload: { requestId, granted: false, error },
                }),
            );
        };

        try {
            if (!ClientRepository.findById(clientId)) {
                deny("Unknown client");
                return;
            }
            // The connection mode says nothing here: a tunnelled inbound client is as
            // entitled to a lease as an outbound one, and an outbound client whose jobs
            // go straight to the PBS is not entitled to one at all.
            if (!ClientTunnelRepository.isConfigured(clientId)) {
                deny("No SSH tunnel is configured for this client");
                return;
            }

            const resolved = await this.resolveTarget(clientId, runId, jobId);
            if ("error" in resolved) {
                deny(resolved.error);
                return;
            }
            const { target } = resolved;

            // Measured here rather than taken from the job snapshot: the client will
            // reach the PBS as 127.0.0.1 and can never validate the certificate itself.
            const fingerprint = await this.resolveFingerprint(target, log);

            const lease = await TunnelService.acquire(
                clientId,
                target,
                runId,
                jobId,
            );
            socket.send(
                JSON.stringify({
                    type: WS_EVENTS.TUNNEL_ACQUIRE_RESULT,
                    payload: {
                        requestId,
                        granted: true,
                        leaseId: lease.leaseId,
                        bindHost: lease.bindHost,
                        bindPort: lease.bindPort,
                        fingerprint,
                    },
                }),
            );
        } catch (e) {
            deny(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolves the PBS endpoint for a request. Backups carry a jobId whose repository is
     * looked up in the server-side job cache; restores carry only a runId, which the
     * server pre-authorised when it triggered the restore.
     *
     * The cached job decides whether the request is entitled at all: a job not configured
     * for the tunnel gets no lease, however the agent asks. It does not decide where the
     * tunnel leads. The job cache is filled by the agent itself (JOB_LIST_CONFIG), so its
     * repository URL is the client's word — a compromised agent could point it at any
     * host the server reaches. The URL is therefore only a key into the repositories
     * configured on this server, and the target is what that configuration says.
     */
    private static async resolveTarget(
        clientId: string,
        runId: string,
        jobId?: string,
    ): Promise<{ target: TunnelTarget } | { error: string }> {
        if (!jobId) {
            // Checked against the configured repositories when the restore was triggered.
            const target = TunnelService.resolveRunTarget(clientId, runId);
            return target
                ? { target }
                : { error: "No tunnel target was authorised for this run" };
        }

        let job = ProxyService.getCachedJob(clientId, jobId);
        if (!job) {
            // Cache may be cold right after a restart — refresh once before giving up.
            await ProxyService.refreshJobCache(clientId);
            job = ProxyService.getCachedJob(clientId, jobId);
        }
        if (!job?.repository?.baseUrl) {
            return { error: "Job unknown or belongs to another client" };
        }
        if (!job.tunnel?.required) {
            return { error: "Job is not configured for the tunnel" };
        }

        const target = this.configuredTarget(
            job.repository.baseUrl,
            job.repository.repositoryId,
        );
        return target
            ? { target }
            : {
                  error: `Repository ${job.repository.baseUrl} is not configured on this server`,
              };
    }

    /**
     * The tunnel target for a repository URL an agent or a request named — but only if it
     * belongs to a repository configured on this server, and taken from that configuration.
     *
     * With a repositoryId the stored entry is authoritative: an id that no longer exists
     * matches nothing, rather than falling back to the URL, or the id would be worthless.
     * Without one (jobs from before the id, restore requests) the URL's host and port have
     * to match a stored base_url.
     */
    static configuredTarget(
        baseUrl: string,
        repositoryId?: string,
    ): TunnelTarget | undefined {
        if (repositoryId) {
            const repo = RepositoryConfigRepository.findById(repositoryId);
            return repo?.base_url
                ? this.repositoryTarget(repo.base_url)
                : undefined;
        }

        const requested = this.repositoryTarget(baseUrl);
        if (!requested) return undefined;
        const repo = this.findRepositoryByTarget(requested);
        return repo?.base_url ? this.repositoryTarget(repo.base_url) : undefined;
    }

    /** The configured repository whose base_url points at this host and port. */
    private static findRepositoryByTarget(target: TunnelTarget) {
        return RepositoryConfigRepository.findAll().find((r) => {
            // base_url is nullable on the row; a repository without one matches nothing.
            const t = r.base_url ? this.repositoryTarget(r.base_url) : undefined;
            return t?.host === target.host && t?.port === target.port;
        });
    }

    /**
     * Records a fingerprint a client measured. Logged and kept for the operator to look
     * at — never written into the repository config, because a single compromised client
     * must not be able to set the value every other client then trusts.
     */
    static recordObservedFingerprint(
        clientId: string,
        payload: {
            repositoryId?: string;
            baseUrl: string;
            fingerprint: string;
            caValid: boolean;
        },
        log: AgentLogger,
    ): void {
        const repo = payload.repositoryId
            ? RepositoryConfigRepository.findById(payload.repositoryId)
            : RepositoryConfigRepository.findAll().find(
                  (r) => r.base_url === payload.baseUrl,
              );

        if (!repo) {
            log.warn({
                msg: "Fingerprint reported for an unknown repository",
                clientId,
                baseUrl: payload.baseUrl,
            });
            return;
        }

        FingerprintObservations.record(
            repo.id,
            clientId,
            payload.fingerprint,
            payload.caValid,
        );
    }

    /**
     * Determines which fingerprint a tunneled run should pin. A measured value is only
     * used when the regular CA validation vouched for it; otherwise the stored value —
     * which an operator confirmed by hand — stays authoritative.
     */
    private static async resolveFingerprint(
        target: { host: string; port: number },
        log: AgentLogger,
    ): Promise<string | undefined> {
        const repo = this.findRepositoryByTarget(target);

        const baseUrl =
            repo?.base_url ?? `https://${target.host}:${target.port}`;
        const stored = normalizeFingerprint(repo?.fingerprint);

        const probe = await probeCertificate(baseUrl);

        if (probe.caValid && probe.fingerprint) {
            if (stored && stored !== probe.fingerprint) {
                log.warn({
                    msg: "Stored fingerprint is outdated — using the measured one for this run",
                    baseUrl,
                    stored,
                    measured: probe.fingerprint,
                });
            }
            return probe.fingerprint;
        }

        // A failed probe must never block a backup: fall back to what is stored.
        return repo?.fingerprint || undefined;
    }

    /**
     * Turns a repository base URL into the host/port the tunnel must forward to.
     * The port is whatever the URL says — see parseRepositoryEndpoint; a PBS on its own
     * API port has to be written as `https://pbs.example.com:8007`.
     */
    static repositoryTarget(
        baseUrl: string,
    ): { host: string; port: number } | undefined {
        const endpoint = parseRepositoryEndpoint(baseUrl);
        return endpoint
            ? { host: endpoint.host, port: endpoint.port }
            : undefined;
    }
}
