import crypto from "crypto";
import db from "../core/Database.js";

/**
 * How a registration token is stored and looked up. The value itself is shown once, when it
 * is issued; the table only holds its SHA-256 hash, which the list shows in its place.
 */
export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** A row of the `registration_tokens` table. */
export interface RegistrationTokenRow {
    /** SHA-256 of the token, hex. The token itself is never stored. */
    token_hash: string;
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
                "SELECT * FROM registration_tokens WHERE token_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')",
            )
            .get(hashToken(token)) as RegistrationTokenRow | undefined;
    }

    static create(
        token: string,
        expiresAt: string,
        defaults: RegistrationTokenDefaults = {},
    ): void {
        db.prepare(
            "INSERT INTO registration_tokens (token_hash, expires_at, display_name, allowed_ip) VALUES (?, ?, ?, ?)",
        ).run(
            hashToken(token),
            expiresAt,
            defaults.displayName ?? null,
            defaults.allowedIp ?? null,
        );
    }

    static markUsed(tokenHash: string): { changes: number } {
        return db
            .prepare(
                "UPDATE registration_tokens SET used_at = datetime('now') WHERE token_hash = ?",
            )
            .run(tokenHash);
    }

    static delete(tokenHash: string): { changes: number } {
        return db
            .prepare("DELETE FROM registration_tokens WHERE token_hash = ?")
            .run(tokenHash);
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
