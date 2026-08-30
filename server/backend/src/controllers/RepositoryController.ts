import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { WS_EVENTS, BackupJob } from "@pbcm/shared";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import {
    probeCertificate,
    normalizeFingerprint,
} from "../services/CertProbe.js";
import { FingerprintObservations } from "../services/FingerprintObservations.js";
import { ProxyService } from "../services/ProxyService.js";
import { logger } from "../core/logger.js";

/**
 * Decides whether a job's embedded repository copy belongs to the given repository.
 * Preferred path is the id; base URL plus datastore is the fallback for jobs stored
 * before the id existed and not yet reached by the backfill.
 */
function jobUsesRepository(job: BackupJob, repo: any): boolean {
    const jobRepo = job.repository;
    if (!jobRepo) return false;
    if (jobRepo.repositoryId) return jobRepo.repositoryId === repo.id;
    return (
        jobRepo.baseUrl === repo.base_url && jobRepo.datastore === repo.datastore
    );
}

export class RepositoryController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const repos = RepositoryConfigRepository.findAll();
        return repos.map((repo) => ({
            ...repo,
            baseUrl: repo.base_url,
            status: "unknown",
            observed: FingerprintObservations.get(repo.id),
        }));
    }

    /**
     * Measures the certificate the PBS currently serves and holds it against the stored
     * fingerprint. Read-only — adopting the measured value is a separate, explicit PUT,
     * because a mismatch alone does not tell an operator whether the certificate was
     * renewed or replaced by someone else.
     */
    static async probeCertificate(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = RepositoryConfigRepository.findById(repositoryId);

        if (!repo)
            return reply.code(404).send({ error: "Repository not found" });
        if (!repo.base_url) {
            return reply
                .code(500)
                .send({ error: "Repository record is incomplete" });
        }

        const probe = await probeCertificate(repo.base_url);
        const stored = normalizeFingerprint(repo.fingerprint);
        const measured = probe.fingerprint;

        return {
            storedFingerprint: repo.fingerprint || null,
            measuredFingerprint: measured || null,
            matches: !!measured && !!stored && measured === stored,
            caValid: probe.caValid,
            reachable: probe.reachable,
            notAfter: probe.notAfter || null,
            error: probe.error || null,
        };
    }

    /**
     * Pushes the stored fingerprint to every connected client that runs a job against
     * this repository. An explicit operator action rather than an automatic fan-out on
     * update: for a self-signed PBS the stored value is a human decision, and rolling it
     * out should be one too. Offline clients are reported, not queued — they pick the
     * value up on the next regular job save.
     */
    static async distribute(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = RepositoryConfigRepository.findById(repositoryId);

        if (!repo)
            return reply.code(404).send({ error: "Repository not found" });

        const updated: { clientId: string; jobId: string; jobName: string }[] =
            [];
        const failed: { clientId: string; jobId: string; error: string }[] = [];

        for (const { clientId, jobs } of ProxyService.getAllCachedJobs()) {
            for (const job of jobs) {
                if (!jobUsesRepository(job, repo)) continue;
                // A job without an id would be saved as a new one on the client and
                // silently duplicate the schedule.
                if (!job.id) continue;
                if (
                    normalizeFingerprint(job.repository.fingerprint) ===
                    normalizeFingerprint(repo.fingerprint)
                ) {
                    continue;
                }

                const patched = {
                    ...job,
                    repository: {
                        ...job.repository,
                        repositoryId: repo.id,
                        fingerprint: repo.fingerprint ?? undefined,
                    },
                };

                try {
                    const result = await ProxyService.sendRequest(
                        clientId,
                        WS_EVENTS.JOB_SAVE_CONFIG,
                        { requestId: randomUUID(), job: patched },
                    );
                    if (result.success) {
                        updated.push({
                            clientId,
                            jobId: job.id!,
                            jobName: job.name,
                        });
                    } else {
                        failed.push({
                            clientId,
                            jobId: job.id!,
                            error: result.error || "unknown error",
                        });
                    }
                } catch (e) {
                    failed.push({
                        clientId,
                        jobId: job.id!,
                        error: e instanceof Error ? e.message : String(e),
                    });
                }
            }
        }

        const touchedClients = [...new Set(updated.map((u) => u.clientId))];
        for (const clientId of touchedClients) {
            ProxyService.refreshJobCache(clientId).catch((e) =>
                logger.error(
                    { err: e, clientId },
                    "Failed to refresh cache after fingerprint distribution",
                ),
            );
        }

        const skippedOffline = ProxyService.getClientsWithStatus()
            .filter((c: any) => c.status !== "online")
            .map((c: any) => ({
                clientId: c.id,
                hostname: c.displayName || c.hostname,
            }));

        logger.info(
            { repositoryId, updated: updated.length, failed: failed.length },
            "Fingerprint distributed to connected clients",
        );

        return { updated, failed, skippedOffline };
    }

    static async getStatus(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = RepositoryConfigRepository.findById(repositoryId);

        if (!repo)
            return reply.code(404).send({ error: "Repository not found" });

        if (!repo.base_url || !repo.datastore) {
            return reply
                .code(500)
                .send({ error: "Repository record is incomplete" });
        }

        try {
            let baseUrl = repo.base_url;
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

            const url = `${baseUrl}/api2/json/admin/datastore/${repo.datastore}/status`;
            const authHeader = `PBSAPIToken ${repo.username}!${repo.tokenname || "token"}:${repo.secret}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { Authorization: authHeader },
                signal: controller.signal,
            } as any);

            clearTimeout(timeoutId);

            if (res.ok) {
                return { status: "online" };
            } else {
                return { status: "offline" };
            }
        } catch (e) {
            return { status: "offline" };
        }
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const { baseUrl, datastore, fingerprint, username, tokenname, secret } =
            request.body as any;
        const id = randomUUID();

        RepositoryConfigRepository.create(
            id,
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname,
            secret,
        );

        return { id, status: "created" };
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const { baseUrl, datastore, fingerprint, username, tokenname, secret } =
            request.body as any;

        const res = RepositoryConfigRepository.update(
            repositoryId,
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname,
            secret,
        );

        if (res.changes === 0)
            return reply.code(404).send({ error: "Repository not found" });
        return { status: "updated" };
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        RepositoryConfigRepository.delete(repositoryId);
        return { status: "deleted" };
    }

    static async listSnapshots(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = RepositoryConfigRepository.findById(repositoryId);

        if (!repo)
            return reply.code(404).send({ error: "Repository not found" });

        if (!repo.base_url || !repo.datastore) {
            return reply
                .code(500)
                .send({ error: "Repository record is incomplete" });
        }

        try {
            let baseUrl = repo.base_url;
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

            const url = `${baseUrl}/api2/json/admin/datastore/${repo.datastore}/snapshots`;
            const authHeader = `PBSAPIToken ${repo.username}!${repo.tokenname || "token"}:${repo.secret}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { Authorization: authHeader },
                signal: controller.signal,
            } as any);

            clearTimeout(timeoutId);

            if (res.ok) {
                const data = (await res.json()) as any;
                return data.data.map((s: any) => ({
                    ...s,
                    backupType: s["backup-type"],
                    backupId: s["backup-id"],
                    backupTime: s["backup-time"],
                }));
            } else {
                return reply
                    .code(502)
                    .send({ error: "Failed to fetch from PBS" });
            }
        } catch (e) {
            return reply.code(502).send({ error: "Failed to connect to PBS" });
        }
    }
}
