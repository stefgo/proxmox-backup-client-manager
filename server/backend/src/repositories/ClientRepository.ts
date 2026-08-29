import db from "../core/Database.js";

export class ClientRepository {
    static findAll(): any[] {
        return db.prepare("SELECT * FROM clients").all() as any[];
    }

    static findById(id: string): any {
        return db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as any;
    }

    static findByToken(token: string): any {
        return db
            .prepare(
                "SELECT id, inbound_registered_ip, connection_mode FROM clients WHERE auth_token = ?",
            )
            .get(token) as any;
    }

    /** Clients the server dials itself. Reconnected on startup and after connection loss. */
    static findOutboundClients(): any[] {
        return db
            .prepare("SELECT * FROM clients WHERE connection_mode = 'outbound'")
            .all() as any[];
    }

    static upsert(
        id: string,
        hostname: string,
        authToken: string,
        allowedIp: string,
    ): void {
        const stmt = db.prepare(`
            INSERT INTO clients (id, hostname, auth_token, inbound_registered_ip, connection_mode, last_seen)
            VALUES (?, ?, ?, ?, 'inbound', datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                hostname = excluded.hostname,
                auth_token = excluded.auth_token,
                inbound_registered_ip = excluded.inbound_registered_ip,
                updated_at = datetime('now')
        `);
        stmt.run(id, hostname, authToken, allowedIp);
    }

    /**
     * Creates an outbound client. Only called after both the tunnel test and the
     * registration handshake succeeded — see ClientController.createOutbound.
     */
    static createOutbound(
        id: string,
        hostname: string,
        outboundTargetAddress: string,
        authToken: string,
        version: string | null,
    ): void {
        db.prepare(
            `
            INSERT INTO clients (id, hostname, outbound_target_address, auth_token, version, connection_mode, last_seen)
            VALUES (?, ?, ?, ?, ?, 'outbound', datetime('now'))
        `,
        ).run(id, hostname, outboundTargetAddress, authToken, version);
    }

    static updateAuthToken(id: string, authToken: string): void {
        db.prepare(
            "UPDATE clients SET auth_token = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(authToken, id);
    }

    static updateDisplayName(
        id: string,
        displayName: string,
    ): { changes: number } {
        return db
            .prepare("UPDATE clients SET display_name = ? WHERE id = ?")
            .run(displayName, id);
    }

    static updateAuthSuccess(
        id: string,
        ipAddress: string,
        version: string | null,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, ip_address=?, version=? WHERE id=?",
        ).run(now, now, ipAddress, version, id);
    }

    /**
     * Same as updateAuthSuccess but without an IP: for outbound clients the server is
     * the connecting party, so there is no remote IP to record.
     */
    static updateOutboundAuthSuccess(id: string, version: string | null): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, version=? WHERE id=?",
        ).run(now, now, version, id);
    }

    static updateLastSeen(id: string): void {
        const now = new Date().toISOString();
        db.prepare("UPDATE clients SET updated_at=? WHERE id = ?").run(now, id);
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    }
}
