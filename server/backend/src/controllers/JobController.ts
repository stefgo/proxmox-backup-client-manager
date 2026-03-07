import { FastifyReply, FastifyRequest } from "fastify";
import { ProxyService } from "../services/ProxyService.js";
import { WS_EVENTS, BackupJobSchema, RestoreJobSchema } from "@pbcm/shared";
import { randomUUID } from "crypto";

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

        try {
            const jobData = parsed.data;
            const result = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.JOB_SAVE_CONFIG,
                { requestId: request.id, job: jobData },
            );

            if (result.success) {
                // Refresh backend cache since the job was successfully saved on client
                ProxyService.refreshJobCache(clientId).catch((e) => {
                    import("../core/Logger.js").then((m) =>
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
                    import("../core/Logger.js").then((m) =>
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
        }).safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: parsed.error.issues[0].message });
        }
        const { snapshot, targetPath, repository, archives, encryption } =
            parsed.data;
        const runId = randomUUID();

        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.RUN_RESTORE, {
                runId,
                snapshot,
                targetPath,
                repository,
                archives,
                encryption,
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
