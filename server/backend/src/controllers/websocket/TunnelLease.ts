import {
    WS_EVENTS,
    WsMessage,
    TunnelAcquireSchema,
    parseRepositoryEndpoint,
    normalizeFingerprint,
} from "@pbcm/shared";
import { probeCertificate } from "@pbcm/shared/node";
import { ProxyService } from "../../services/ProxyService.js";
import { TunnelService } from "../../services/TunnelService.js";
import { ClientRepository } from "../../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../../repositories/ClientTunnelRepository.js";
import { RepositoryConfigRepository } from "../../repositories/RepositoryConfigRepository.js";
import { FingerprintObservations } from "../../services/FingerprintObservations.js";
import type { AgentLogger } from "./AgentMessageRouter.js";

/**
 * Everything an agent's tunnel request touches, in one module.
 *
 * These four functions used to sit among the connection handshakes in
 * `WebSocketController`. They belong together and apart from those: this is where the
 * security property of the tunnel lives — the requesting client never names a host, and
 * the server derives the target from the job it pushed out itself. Keeping that reasoning
 * in one file is the point of the split, not the line count.
 */
export class TunnelLease {
    /**
     * Grants or denies a tunnel lease. Everything security relevant happens here:
     * the requested job must belong to the requesting client, and the target is derived
     * from the job's repository — never from the request.
     */
    static async handleAcquire(
        clientId: string,
        socket: any,
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

            const target = await this.resolveTarget(clientId, runId, jobId);
            if (!target) {
                deny(
                    "No permitted tunnel target for this request — job unknown or belongs to another client",
                );
                return;
            }

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
     * The cached job is also what authorises the request: a job not configured for the
     * tunnel gets no target and therefore no lease, however the agent asks. The server
     * never takes the client's word for the route — it reads back the job it pushed out.
     */
    private static async resolveTarget(
        clientId: string,
        runId: string,
        jobId?: string,
    ): Promise<{ host: string; port: number } | undefined> {
        if (!jobId) {
            return TunnelService.resolveRunTarget(clientId, runId);
        }

        let job = ProxyService.getCachedJob(clientId, jobId);
        if (!job) {
            // Cache may be cold right after a restart — refresh once before giving up.
            await ProxyService.refreshJobCache(clientId);
            job = ProxyService.getCachedJob(clientId, jobId);
        }
        if (!job?.repository?.baseUrl) return undefined;
        if (!job.tunnel?.required) return undefined;

        return this.repositoryTarget(job.repository.baseUrl);
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
                  (r: any) => r.base_url === payload.baseUrl,
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
        const repo = RepositoryConfigRepository.findAll().find((r: any) => {
            const t = this.repositoryTarget(r.base_url);
            return t?.host === target.host && t?.port === target.port;
        });

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
