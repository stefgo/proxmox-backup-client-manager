import db from "../core/Database.js";

export class RepositoryConfigRepository {
    static findAll(): any[] {
        return db
            .prepare("SELECT * FROM repositories ORDER BY base_url ASC")
            .all() as any[];
    }

    static findById(id: string): any {
        return db
            .prepare("SELECT * FROM repositories WHERE id = ?")
            .get(id) as any;
    }

    static create(
        id: string,
        baseUrl: string,
        datastore: string,
        fingerprint: string,
        username: string,
        tokenname: string,
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

    static update(
        id: string,
        baseUrl: string,
        datastore: string,
        fingerprint: string,
        username: string,
        tokenname: string,
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
