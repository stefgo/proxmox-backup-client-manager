import db from "../core/Database.js";
import { decryptSecret, encryptSecret } from "../services/SecretCrypto.js";

/**
 * A row of the `repositories` table; mapping to the shared camelCase `Repository` happens
 * in the controller.
 *
 * `secret` is the PBS token secret encrypted with SecretCrypto (migration 18) -- never hand
 * the row to a client as it is, and read the value through findSecret().
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
        ).run(
            id,
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname,
            encryptSecret(secret),
        );
    }

    /**
     * The repository's PBS token secret, decrypted. Undefined when the repository does not
     * exist or has none; throws if it cannot be decrypted (usually a changed
     * secretKey).
     */
    static findSecret(id: string): string | undefined {
        const row = db
            .prepare("SELECT secret FROM repositories WHERE id = ?")
            .get(id) as { secret: string | null } | undefined;
        return row?.secret ? decryptSecret(row.secret) : undefined;
    }

    /**
     * Same nullability rules as `create`. A `secret` of `null` keeps the stored one: the
     * secret never leaves the server, so an editor that did not change it has nothing to
     * send back.
     */
    static update(
        id: string,
        baseUrl: string,
        datastore: string,
        fingerprint: string | null,
        username: string,
        tokenname: string | null,
        secret: string | null,
    ): { changes: number } {
        return db
            .prepare(
                `
            UPDATE repositories 
            SET base_url = ?, datastore = ?, fingerprint = ?, username = ?, tokenname = ?, secret = COALESCE(?, secret), updated_at = datetime('now')
            WHERE id = ?
        `,
            )
            .run(
                baseUrl,
                datastore,
                fingerprint,
                username,
                tokenname,
                secret === null ? null : encryptSecret(secret),
                id,
            );
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM repositories WHERE id = ?").run(id);
    }
}
