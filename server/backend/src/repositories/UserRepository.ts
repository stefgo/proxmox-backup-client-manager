import db from "../core/Database.js";
import { HistorySeenRepository } from "./HistorySeenRepository.js";

/** A row of the `users` table. `id` is INTEGER AUTOINCREMENT, hence number, not string. */
export interface UserRow {
    id: number;
    username: string | null;
    password_hash: string | null;
    auth_methods: string | null;
    /** Carried by every session token as `tv`; raising it ends all of the user's sessions. */
    token_version: number;
    created_at: string;
    updated_at: string | null;
}

/** What findAll selects — password_hash is deliberately not among the columns. */
export type UserListRow = Pick<
    UserRow,
    "id" | "username" | "auth_methods" | "created_at" | "updated_at"
>;

export class UserRepository {
    static countAll(): number {
        const result = db
            .prepare("SELECT COUNT(*) as count FROM users")
            .get() as { count: number };
        return result.count;
    }

    static findAll(): UserListRow[] {
        return db
            .prepare(
                "SELECT id, username, auth_methods, created_at, updated_at FROM users",
            )
            .all() as UserListRow[];
    }

    static findByUsername(username: string): UserRow | undefined {
        return db
            .prepare("SELECT * FROM users WHERE username = ?")
            .get(username) as UserRow | undefined;
    }

    static findById(id: string): UserRow | undefined {
        return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
            | UserRow
            | undefined;
    }

    /**
     * The user starts with everything that has happened so far marked as seen: the failures
     * of before their time are not news to them. Written with the user, so there is no
     * user without a mark.
     */
    static create(
        username: string,
        passwordHash: string | null,
        authMethods: string,
    ): void {
        db.transaction(() => {
            db.prepare(
                "INSERT INTO users (username, password_hash, auth_methods) VALUES (?, ?, ?)",
            ).run(username, passwordHash, authMethods);
            HistorySeenRepository.set(username, new Date().toISOString());
        })();
    }

    /** Also ends every session of the user: a token signed under the old password must not outlive it. */
    static updatePassword(id: string, passwordHash: string): void {
        db.prepare(
            "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(passwordHash, id);
    }

    /**
     * Ends the user's sessions only when the value actually changes: the user form sends
     * `auth_methods` on every save, and an unchanged value revokes nothing.
     */
    static updateAuthMethods(id: string, authMethods: string): void {
        db.prepare(
            `UPDATE users SET auth_methods = ?,
                token_version = token_version + (COALESCE(auth_methods, '') <> ?),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
        ).run(authMethods, authMethods, id);
    }

    /** Takes what the user had marked as seen along; see `HistorySeenRepository.deleteForUser`. */
    static delete(id: string): { changes: number } {
        return db.transaction(() => {
            const username = this.findById(id)?.username;
            if (username) HistorySeenRepository.deleteForUser(username);
            return db.prepare("DELETE FROM users WHERE id = ?").run(id);
        })();
    }
}
