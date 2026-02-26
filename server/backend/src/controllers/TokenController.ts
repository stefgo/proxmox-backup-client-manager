import { FastifyRequest, FastifyReply } from 'fastify';
import db from '../core/db.js';
import crypto from 'crypto';

import { ProxyService } from '../services/ProxyService.js';

export const TokenController = {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
        const tokens = db.prepare('SELECT * FROM registration_tokens ORDER BY created_at DESC').all() as any[];
        return tokens.map(t => ({
            ...t,
            createdAt: t.created_at,
            expiresAt: t.expires_at,
            usedAt: t.used_at
        }));
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO registration_tokens (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
        return { token, expiresAt };
    },

    delete: async (request: FastifyRequest, reply: FastifyReply) => {
        const { token } = request.params as { token: string };
        db.prepare('DELETE FROM registration_tokens WHERE token = ?').run(token);
        return { status: 'deleted' };
    },

    register: async (request: FastifyRequest, reply: FastifyReply) => {
        const { token } = request.body as any;
        const tokenRow = db.prepare("SELECT * FROM registration_tokens WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')").get(token) as any;

        if (!tokenRow) {
            return reply.code(403).send({ error: 'Invalid or expired token' });
        }

        try {
            const clientId = (request.body as any).clientId;
            const hostname = (request.body as any).hostname || 'unknown';
            
            if (!clientId) return reply.code(400).send({ error: 'Missing clientId' });

            // Generate Auth Token
            const authToken = crypto.randomBytes(64).toString('hex');
            
            // Capture IP (Requires trustProxy: true in Fastify config if behind proxy)
            const allowedIp = request.ip;

            db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE token = ?").run(token);

            // Upsert client (overwrite if exists, since we break existing clients anyway)
            // Using REPLACE or ON CONFLICT to update
            const stmt = db.prepare(`
                INSERT INTO clients (id, hostname, auth_token, allowed_ip, last_seen) 
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    hostname = excluded.hostname,
                    auth_token = excluded.auth_token,
                    allowed_ip = excluded.allowed_ip,
                    updated_at = datetime('now')
            `);
            
            stmt.run(clientId, hostname, authToken, allowedIp);

            ProxyService.broadcastClientUpdate();

            return { token: authToken, clientId };

        } catch (e: any) {
            request.log.error({ err: e }, 'Registration failed');
            return reply.code(500).send({ error: 'Registration failed' });
        }
    }
};
