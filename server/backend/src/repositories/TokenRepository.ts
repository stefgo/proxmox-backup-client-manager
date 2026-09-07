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
}
