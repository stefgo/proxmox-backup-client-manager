import { FastifyReply, FastifyRequest } from 'fastify';
import db from '../core/db.js';
import bcrypt from 'bcryptjs';

export class UserController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return db.prepare('SELECT id, username, auth_methods, created_at, updated_at FROM users').all();
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const { username, password, auth_methods } = request.body as any;
        if (!username) return reply.code(400).send({ error: 'Username required' });

        const methods = auth_methods || 'local';
        if (methods.includes('local') && !password) {
            return reply.code(400).send({ error: 'Password required for local authentication' });
        }

        try {
            const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
            db.prepare('INSERT INTO users (username, password_hash, auth_methods) VALUES (?, ?, ?)').run(username, hashedPassword, methods);
            return { status: 'created' };
        } catch (e: any) {
            if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return reply.code(409).send({ error: 'Username already exists' });
            }
            throw e;
        }
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = request.params as { userId: string };
        const { password, auth_methods } = request.body as any;

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
        if (!user) return reply.code(404).send({ error: 'User not found' });

        const nextAuthMethods = auth_methods || user.auth_methods || 'local';

        // Validation 1: Password change allowed ONLY for locally authenticated users.
        if (password) {
            if (!nextAuthMethods.includes('local')) {
                return reply.code(400).send({ error: 'Cannot set password for user without local authentication' });
            }
            const hashedPassword = bcrypt.hashSync(password, 10);
            db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userId);
        }

        // Validation 2: Users with local authentication MUST have a password.
        if (nextAuthMethods.includes('local') && !user.password_hash && !password) {
            return reply.code(400).send({ error: 'User with local authentication must have a password' });
        }

        if (auth_methods) {
            db.prepare('UPDATE users SET auth_methods = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(auth_methods, userId);
        }

        return { status: 'updated' };
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = request.params as { userId: string };
        const user = request.user as any;

        if (user && String(user.id) === String(userId)) {
            return reply.code(400).send({ error: 'Cannot delete yourself' });
        }

        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        if (userCount.count <= 1) {
            return reply.code(400).send({ error: 'Cannot delete the last user' });
        }

        const info = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        if (info.changes === 0) return reply.code(404).send({ error: 'User not found' });

        return { status: 'deleted' };
    }
}
