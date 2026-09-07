import db from "../core/Database.js";

/**
 * A row of the `repositories` table. The secret is stored here as written by the
 * controller; mapping to the shared camelCase `Repository` happens there.
 */
export interface RepositoryRow {
    id: string;
    base_url: string | null;
    datastore: string | null;
    fingerprint: string | null;
    username: string | null;
    tokenname: string | null;
    secret: string | null;
    created_at: string;
    updated_at: string | null;
}

export class RepositoryConfigRepository {
    static findAll(): RepositoryRow[] {
        return db
            .prepare("SELECT * FROM repositories ORDER BY base_url ASC")
            .all() as RepositoryRow[];
    }

    static findById(id: string): RepositoryRow | undefined {
        return db.prepare("SELECT * FROM repositories WHERE id = ?").get(id) as
            | RepositoryRow
            | undefined;
    }

    /**
     * `fingerprint` and `tokenname` are nullable because their columns are, and because
     * both are genuinely optional: a PBS with a CA-signed certificate needs no pinned
     * fingerprint, and an API token without a name falls back to "token" at call time.
     *
     * They must be `null` and never `undefined` -- better-sqlite3 rejects `undefined` as a
     * bound value. The controllers pass `?? null` for exactly that reason.
     */
    static create(
        id: string,
        baseUrl: string,
        datastore: string,
        fingerprint: string | null,
        username: string,
        tokenname: string | null,
        secret: string,
    ): void {
        db.prepare(
            `
            INSERT INTO repositories 
            (id, base_url, datastore, fingerprint, username, tokenname, secret) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(id, baseUrl, datastore, fingerprint, username, tokenname, secret);
    }

    /** Same nullability rules as `create`. */
    static update(
        id: string,
        baseUrl: string,
        datastore: string,
        fingerprint: string | null,
        username: string,
        tokenname: string | null,
        secret: string,
    ): { changes: number } {
        return db
            .prepare(
                `
            UPDATE repositories 
            SET base_url = ?, datastore = ?, fingerprint = ?, username = ?, tokenname = ?, secret = ?, updated_at = datetime('now')
            WHERE id = ?
        `,
            )
            .run(
                baseUrl,
                datastore,
                fingerprint,
                username,
                tokenname,
                secret,
                id,
            );
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM repositories WHERE id = ?").run(id);
    }
}
