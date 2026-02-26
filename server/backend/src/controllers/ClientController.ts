import { FastifyReply, FastifyRequest } from 'fastify';
import db from '../core/db.js';
import { ProxyService } from '../services/ProxyService.js';
import { WS_EVENTS } from '@pbcm/shared';

export class ClientController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return ProxyService.getClientsWithStatus();
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const info = db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);

        if (info.changes === 0) {
            return reply.code(404).send({ error: 'Client not found' });
        }

        // Disconnect if online
        const socket = ProxyService.getClientSocket(clientId);
        if (socket) {
            socket.close(4000, 'Client deleted');
            ProxyService.unregisterClient(clientId);
        }

        ProxyService.broadcastClientUpdate();
        return { status: 'deleted' };
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = request.body as { displayName?: string };
        
        try {
            const updated = ProxyService.updateClient(clientId, body);
            if (!updated) {
                 return reply.code(404).send({ error: 'Client not found' });
            }
            return { success: true };
        } catch (e: any) {
             return reply.code(500).send({ error: e.message });
        }
    }

    static async getHistory(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const result = await ProxyService.sendRequest(clientId, WS_EVENTS.HISTORY, { requestId: request.id });
            return result.history;
            // The payload from client is: { requestId, history: [...] }
        } catch (e: any) {
            return reply.code(404).send({ error: e.message });
        }
    }

    static async getFs(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const { path: fsPath } = request.query as { path: string };

        try {
            const payload = await ProxyService.sendRequest(clientId, WS_EVENTS.FS_LIST, { requestId: request.id, path: fsPath || '/' });
            // Payload: { requestId, files: [...], error? }
            return payload.files;
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    }

    static async getVersion(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const payload = await ProxyService.sendRequest(clientId, WS_EVENTS.GET_VERSION, { requestId: request.id });
            return payload; // Returns { requestId, version, error? }
        } catch (e: any) {
            return reply.code(404).send({ error: e.message });
        }
    }
}
