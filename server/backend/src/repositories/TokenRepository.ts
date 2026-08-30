import db from "../core/Database.js";

/** A row of the `registration_tokens` table. */
export interface RegistrationTokenRow {
    token: string;
    created_at: string;
    expires_at: string | null;
    used_at: string | null;
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

    static create(token: string, expiresAt: string): void {
        db.prepare(
            "INSERT INTO registration_tokens (token, expires_at) VALUES (?, ?)",
        ).run(token, expiresAt);
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
