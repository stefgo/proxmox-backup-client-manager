import { FastifyReply, FastifyRequest } from 'fastify';
import db from '../core/db.js';
import { randomUUID } from 'crypto';

export class RepositoryController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const repos = db.prepare('SELECT * FROM repositories ORDER BY base_url ASC').all() as any[];
        return repos.map(repo => ({ ...repo, baseUrl: repo.base_url, status: 'unknown' }));
    }

    static async getStatus(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as any;

        if (!repo) return reply.code(404).send({ error: 'Repository not found' });

        try {
            let baseUrl = repo.base_url;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const url = `${baseUrl}/api2/json/admin/datastore/${repo.datastore}/status`;
            const authHeader = `PBSAPIToken ${repo.username}!${repo.tokenname || 'token'}:${repo.secret}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { 'Authorization': authHeader },
                signal: controller.signal
            } as any);

            clearTimeout(timeoutId);

            if (res.ok) {
                return { status: 'online' };
            } else {
                return { status: 'offline' };
            }
        } catch (e) {
            return { status: 'offline' };
        }
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const { baseUrl, datastore, fingerprint, username, tokenname, secret } = request.body as any;
        const id = randomUUID();

        db.prepare(`
            INSERT INTO repositories 
            (id, base_url, datastore, fingerprint, username, tokenname, secret) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, baseUrl, datastore, fingerprint, username, tokenname, secret);

        return { id, status: 'created' };
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const { baseUrl, datastore, fingerprint, username, tokenname, secret } = request.body as any;

        const res = db.prepare(`
            UPDATE repositories 
            SET base_url = ?, datastore = ?, fingerprint = ?, username = ?, tokenname = ?, secret = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(baseUrl, datastore, fingerprint, username, tokenname, secret, repositoryId);

        if (res.changes === 0) return reply.code(404).send({ error: 'Repository not found' });
        return { status: 'updated' };
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        db.prepare('DELETE FROM repositories WHERE id = ?').run(repositoryId);
        return { status: 'deleted' };
    }

    static async listSnapshots(request: FastifyRequest, reply: FastifyReply) {
        const { repositoryId } = request.params as { repositoryId: string };
        const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as any;

        if (!repo) return reply.code(404).send({ error: 'Repository not found' });

        try {
            let baseUrl = repo.base_url;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const url = `${baseUrl}/api2/json/admin/datastore/${repo.datastore}/snapshots`;
            const authHeader = `PBSAPIToken ${repo.username}!${repo.tokenname || 'token'}:${repo.secret}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(url, {
                headers: { 'Authorization': authHeader },
                signal: controller.signal
            } as any);

            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json() as any;
                return data.data.map((s: any) => ({
                    ...s,
                    backupType: s['backup-type'],
                    backupId: s['backup-id'],
                    backupTime: s['backup-time'],
                }));
            } else {
                return reply.code(502).send({ error: 'Failed to fetch from PBS' });
            }
        } catch (e) {
            return reply.code(502).send({ error: 'Failed to connect to PBS' });
        }
    }
}
