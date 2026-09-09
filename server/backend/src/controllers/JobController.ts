import { FastifyReply, FastifyRequest } from "fastify";
import { ProxyService } from "../services/ProxyService.js";
import { WS_EVENTS, BackupJobSchema, RestoreJobSchema } from "@pbcm/shared";
import { randomUUID } from "crypto";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { TunnelService } from "../services/TunnelService.js";
import { TunnelLease } from "./websocket/TunnelLease.js";

/**
 * Whether a tunnel is available to this client's jobs at all.
 *
 * Availability is the client's side of it — the stored SSH credentials — and it is
 * independent of the connection mode: an inbound client that cannot reach the PBS itself
 * has a tunnel, an outbound client that can does without. Which jobs actually take it is
 * each job's own `tunnel` setting, stored with the job and pushed to the agent with it.
 */
function tunnelAvailable(clientId: string): boolean {
    return ClientTunnelRepository.isConfigured(clientId);
}

export class JobController {
    /**
     * Queries the connected client for its list of configured backup jobs.
     * @param request - Fastify request containing the clientId
     * @param reply - Fastify reply
     */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const payload = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.JOB_LIST_CONFIG,
                { requestId: request.id },
            );
            return payload.jobs;
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    /**
     * Sends a new or updated job configuration back to the client agent to be saved
     * in its local SQLite database.
     * @param request - Fastify request with job details in the body
     * @param reply - Fastify reply
     */
    static async save(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const parsed = BackupJobSchema.partial().safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: parsed.error.issues[0].message });
        }

        // Refused here rather than at run time: a job asking for a route the client has
        // no credentials for would be saved happily and then fail on every execution,
        // with the cause two screens away from the setting that caused it.
        if (parsed.data.tunnel?.required && !tunnelAvailable(clientId)) {
            return reply.code(400).send({
                error: "This client has no SSH tunnel configured — add one from the client list first.",
            });
        }

        try {
            const result = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.JOB_SAVE_CONFIG,
                { requestId: request.id, job: parsed.data },
            );

            if (result.success) {
                // Refresh backend cache since the job was successfully saved on client
                ProxyService.refreshJobCache(clientId).catch((e) => {
                    import("@pbcm/shared/node").then((m) =>
                        m.logger.error(
                            { err: e, clientId },
                            "Failed to refresh cache after job save",
                        ),
                    );
                });
                return { status: "saved" };
            }
            throw new Error(result.error);
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }
    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId, jobId } = request.params as {
            clientId: string;
            jobId: string;
        };

        try {
            const result = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.JOB_DELETE_CONFIG,
                { requestId: request.id, jobId },
            );
            if (result.success) {
                // Refresh backend cache
                ProxyService.refreshJobCache(clientId).catch((e) => {
                    import("@pbcm/shared/node").then((m) =>
                        m.logger.error(
                            { err: e, clientId },
                            "Failed to refresh cache after job delete",
                        ),
                    );
                });
                return { status: "deleted" };
            }
            throw new Error(result.error);
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async triggerBackup(request: FastifyRequest, reply: FastifyReply) {
        const { clientId, jobId } = request.params as {
            clientId: string;
            jobId: string;
        };
        const runId = randomUUID();

        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.RUN_BACKUP, {
                runId,
                jobId,
            });
            return { status: "triggered", runId };
        } catch (e: unknown) {
            return reply
                .code(400)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async triggerRestore(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const parsed = RestoreJobSchema.pick({
            snapshot: true,
            targetPath: true,
            repository: true,
            archives: true,
            encryption: true,
            tunnel: true,
        }).safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: parsed.error.issues[0].message });
        }
        const { snapshot, targetPath, repository, archives, encryption, tunnel } =
            parsed.data;
        const runId = randomUUID();
        // The route is the operator's choice here, exactly as it is for a backup job — and
        // for the same reason: a client can reach one PBS directly and another only through
        // the detour, so "credentials are stored" cannot answer it. It used to: a client
        // with a tunnel restored through it from every repository, which was a route that
        // always worked but was not always the right one, and could not be declined.
        //
        // The restore form asks the question next to the repository it is asked about, and
        // the answer travels with this one request. Availability is only checked here, the
        // same check the job save does.
        const tunneled = !!tunnel?.required;
        if (tunneled && !tunnelAvailable(clientId)) {
            return reply.code(400).send({
                error: "This client has no SSH tunnel configured — add one from the client list first.",
            });
        }

        try {
            if (tunneled) {
                // A restore carries no jobId, so the client cannot reference a stored job
                // when asking for its tunnel. Pre-authorise the target for this runId —
                // the client still never names a host itself.
                const target = TunnelLease.repositoryTarget(
                    repository.baseUrl,
                );
                if (!target) {
                    return reply
                        .code(400)
                        .send({ error: "Repository URL is invalid" });
                }
                TunnelService.registerRunTarget(clientId, runId, target);
            }

            ProxyService.sendFireAndForget(clientId, WS_EVENTS.RUN_RESTORE, {
                runId,
                snapshot,
                targetPath,
                repository,
                archives,
                encryption,
                tunnel: tunneled ? { required: true } : undefined,
            });
            return { status: "triggered", runId };
        } catch (e: unknown) {
            return reply
                .code(400)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async generateKey(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };

        try {
            const result = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.GENERATE_KEY_CONFIG,
                { requestId: request.id },
            );
            if (result.success)
                return {
                    status: "key_generated",
                    keyContent: result.keyContent,
                };
            throw new Error(result.error);
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    /**
     * Retrieves all cached jobs from the ProxyService.
     * Used by the Global Jobs dashboard view.
     * @param request - Fastify request
     * @param reply - Fastify reply
     */
    static async listAll(request: FastifyRequest, reply: FastifyReply) {
        return ProxyService.getAllCachedJobs();
    }
}
