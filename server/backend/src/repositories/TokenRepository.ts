import db from "../core/Database.js";

/** A row of the `registration_tokens` table. */
export interface RegistrationTokenRow {
    token: string;
    created_at: string;
    expires_at: string | null;
    used_at: string | null;
    /** Applied to the client this token registers. */
    display_name: string | null;
    /** Where the token may be redeemed from, and the client's IP pin afterwards. */
    allowed_ip: string | null;
}

/** What an operator may decide for a client that is not there yet. */
export interface RegistrationTokenDefaults {
    displayName?: string;
    allowedIp?: string;
}

export class TokenRepository {
    static findAll(): RegistrationTokenRow[] {
        return db
            .prepare(
                "SELECT * FROM registration_tokens ORDER BY created_at DESC",
            )
            .all() as RegistrationTokenRow[];
    }

    static findValidByToken(
        token: string,
    ): RegistrationTokenRow | undefined {
        return db
            .prepare(
                "SELECT * FROM registration_tokens WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')",
            )
            .get(token) as RegistrationTokenRow | undefined;
    }

    static create(
        token: string,
        expiresAt: string,
        defaults: RegistrationTokenDefaults = {},
    ): void {
        db.prepare(
            "INSERT INTO registration_tokens (token, expires_at, display_name, allowed_ip) VALUES (?, ?, ?, ?)",
        ).run(
            token,
            expiresAt,
            defaults.displayName ?? null,
            defaults.allowedIp ?? null,
        );
    }

    static markUsed(token: string): { changes: number } {
        return db
            .prepare(
                "UPDATE registration_tokens SET used_at = datetime('now') WHERE token = ?",
            )
            .run(token);
    }

    static delete(token: string): { changes: number } {
        return db
            .prepare("DELETE FROM registration_tokens WHERE token = ?")
            .run(token);
    }

    /**
     * Removes registration tokens that have become invalid (used or expired) and whose
     * invalidation timestamp is older than the given TTL in days. Returns how many rows went.
     *
     * An invalid token is considered invalidated at COALESCE(used_at, expires_at). Both go
     * through datetime(): `expires_at` is written as ISO text, `used_at` by SQLite itself,
     * and compared as plain strings the two formats disagree within the same day.
     */
    static cleanupInvalidTokens(ttlDays: number): number {
        const days = Number.isFinite(ttlDays) && ttlDays >= 0 ? Math.floor(ttlDays) : 0;

        const result = db.prepare(`
            DELETE FROM registration_tokens
            WHERE (used_at IS NOT NULL OR datetime(expires_at) <= datetime('now'))
              AND datetime(COALESCE(used_at, expires_at)) < datetime('now', ?)
        `).run(`-${days} days`);
        return result.changes;
    }
}
