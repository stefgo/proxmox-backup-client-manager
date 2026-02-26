import { FastifyReply, FastifyRequest } from 'fastify';
import { ProxyService } from '../services/ProxyService.js';
import { WS_EVENTS } from '@pbcm/shared';
import { randomUUID } from 'crypto';

export class JobController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const payload = await ProxyService.sendRequest(clientId, WS_EVENTS.JOB_LIST_CONFIG, { requestId: request.id });
            return payload.jobs;
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    }

    static async save(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const { name, archives, schedule, scheduleEnabled, id, nextRunAt, repository, encryption } = request.body as any;

        try {
            const jobData = { id, name, archives, schedule, scheduleEnabled, nextRunAt, repository, encryption };
            const result = await ProxyService.sendRequest(clientId, WS_EVENTS.JOB_SAVE_CONFIG, { requestId: request.id, job: jobData });

            if (result.success) return { status: 'saved' };
            throw new Error(result.error);
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId, jobId } = request.params as { clientId: string, jobId: string };

        try {
            const result = await ProxyService.sendRequest(clientId, WS_EVENTS.JOB_DELETE_CONFIG, { requestId: request.id, jobId });
            if (result.success) return { status: 'deleted' };
            throw new Error(result.error);
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    }

    static async triggerBackup(request: FastifyRequest, reply: FastifyReply) {
        const { clientId, jobId } = request.params as { clientId: string, jobId: string };
        const runId = randomUUID();

        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.RUN_BACKUP, { runId, jobId });
            return { status: 'triggered', runId };
        } catch (e: any) {
            return reply.code(400).send({ error: e.message });
        }
    }

    static async triggerRestore(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const { snapshot, targetPath, repository, archives, encryption } = request.body as any;
        const runId = randomUUID();

        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.RUN_RESTORE, {
                runId, snapshot, targetPath, repository, archives, encryption
            });
            return { status: 'triggered', runId };
        } catch (e: any) {
            return reply.code(400).send({ error: e.message });
        }
    }

    static async generateKey(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };

        try {
            const result = await ProxyService.sendRequest(clientId, WS_EVENTS.GENERATE_KEY_CONFIG, { requestId: request.id });
            if (result.success) return { status: 'key_generated', keyContent: result.keyContent };
            throw new Error(result.error);
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    }
}
