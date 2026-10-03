import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import {
    WS_EVENTS,
    CLIENT_STATUS,
    REPOSITORY_STATUS,
    BackupJob,
    RepositorySchema,
    PbsSnapshotListSchema,
    normalizeFingerprint,
    firstIssue,
    type CertificateCheck,
    type DistributeResult,
} from "@pbcm/shared";
import { probeCertificate, logger } from "@pbcm/shared/node";
import {
    RepositoryConfigRepository,
    type RepositoryRow,
} from "../repositories/RepositoryConfigRepository.js";
import { FingerprintObservations } from "../services/FingerprintObservations.js";
import { ProxyService } from "../services/ProxyService.js";

/**
 * Decides whether a job's embedded repository copy belongs to the given repository.
 * Preferred path is the id; base URL plus datastore is the fallback for jobs stored
 * before the id existed and not yet reached by the backfill.
 */
function jobUsesRepository(job: BackupJob, repo: RepositoryRow): boolean {
    const jobRepo = job.repository;
    if (!jobRepo) return false;
    if (jobRepo.repositoryId) return jobRepo.repositoryId === repo.id;
    return (
        jobRepo.baseUrl === repo.base_url && jobRepo.datastore === repo.datastore
    );
}

/**
 * The Authorization header for the PBS API. The secret is decrypted here, for this one
 * request, and nowhere else in this controller.
 */
function pbsAuthHeader(repo: RepositoryRow): string {
    const secret = RepositoryConfigRepository.findSecret(repo.id) ?? "";
    return `PBSAPIToken ${repo.username}!${repo.tokenname || "token"}:${secret}`;
}

export class RepositoryController {
    /**
     * Without the secret: it is written, never read back. Every repository has one -- it is
     * required on create -- so the editor knows it is there without being told.
     */
    static async list(_request: FastifyRequest, _reply: FastifyReply) {
        const repos = RepositoryConfigRepository.findAll();
        return repos.map(({ secret: _secret, ...repo }) => ({
            ...repo,
            baseUrl: repo.base_url,
            status: REPOSITORY_STATUS.UNKNOWN,
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
        } satisfies CertificateCheck;
    }

    /**
     * Pushes the stored fingerprint and secret to every connected client that runs a job
     * against this repository. An explicit operator action rather than an automatic
     * fan-out on update: for a self-signed PBS the stored fingerprint is a human decision,
     * and rolling it out should be one too. Offline clients are reported, not queued —
     * they pick the values up on the next regular job save.
     *
     * The secret goes along because a job keeps its own copy of it: the agent runs from
     * `jobs.json`. Without this, a rotated PBS token would only reach a job when someone
     * happened to save it.
     */
    static async distribute(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = RepositoryConfigRepository.findById(repositoryId);

        if (!repo)
            return reply.code(404).send({ error: "Repository not found" });

        let secret: string;
        try {
            secret = RepositoryConfigRepository.findSecret(repo.id) ?? "";
        } catch (e) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }

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
                        normalizeFingerprint(repo.fingerprint) &&
                    job.repository.secret === secret
                ) {
                    continue;
                }

                // From the cache, which still holds the job's own secrets -- the
                // encryption key travels back unchanged.
                const patched = {
                    ...job,
                    repository: {
                        ...job.repository,
                        repositoryId: repo.id,
                        fingerprint: repo.fingerprint ?? undefined,
                        secret,
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
            .filter((c) => c.status !== CLIENT_STATUS.ONLINE)
            .map((c) => ({
                clientId: c.id,
                hostname: c.displayName || c.hostname,
            }));

        logger.info(
            { repositoryId, updated: updated.length, failed: failed.length },
            "Repository credentials distributed to connected clients",
        );

        return { updated, failed, skippedOffline } satisfies DistributeResult;
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
            const authHeader = pbsAuthHeader(repo);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { Authorization: authHeader },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                return { status: REPOSITORY_STATUS.ONLINE };
            } else {
                return { status: REPOSITORY_STATUS.OFFLINE };
            }
        } catch {
            return { status: REPOSITORY_STATUS.OFFLINE };
        }
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        // The full shape, not a partial one: RepositoryEditor checks the same four
        // required fields before it submits and always sends the whole set.
        const parsed = RepositorySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { baseUrl, datastore, username, secret } = parsed.data;
        // Required here only: on update an empty secret means "keep the stored one".
        if (!secret) {
            return reply.code(400).send({ error: "A secret is required" });
        }
        // `?? null`: both columns are nullable, and better-sqlite3 refuses `undefined`.
        const fingerprint = parsed.data.fingerprint ?? null;
        const tokenname = parsed.data.tokenname ?? null;
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
        const parsed = RepositorySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { baseUrl, datastore, username, secret } = parsed.data;
        // `?? null`: both columns are nullable, and better-sqlite3 refuses `undefined`.
        const fingerprint = parsed.data.fingerprint ?? null;
        const tokenname = parsed.data.tokenname ?? null;

        const res = RepositoryConfigRepository.update(
            repositoryId,
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname,
            // The editor never has the stored secret, so it sends one only to change it.
            secret || null,
        );

        if (res.changes === 0)
            return reply.code(404).send({ error: "Repository not found" });
        return { status: "updated" };
    }

    static async delete(request: FastifyRequest, _reply: FastifyReply) {
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
            const authHeader = pbsAuthHeader(repo);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { Authorization: authHeader },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                // PBS is an external system, so its answer is checked like any other
                // input. Until now a response without `data` threw inside the map and
                // surfaced as "Failed to connect to PBS" -- which was wrong, the
                // connection had worked.
                const parsed = PbsSnapshotListSchema.safeParse(
                    await res.json(),
                );
                if (!parsed.success) {
                    return reply.code(502).send({
                        error: `Unexpected response from PBS: ${parsed.error.issues[0].message}`,
                    });
                }
                // Spread first, then add the camelCase names: the kebab-case originals
                // stay on the object, as they always have.
                return parsed.data.data.map((s) => ({
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
        } catch {
            return reply.code(502).send({ error: "Failed to connect to PBS" });
        }
    }
}
