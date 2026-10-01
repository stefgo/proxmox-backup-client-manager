import db from "../core/Database.js";
import { ConnectionMode } from "@pbcm/shared";
import { hashToken } from "./TokenRepository.js";
import { decryptSecret, encryptSecret } from "../services/SecretCrypto.js";

/**
 * A row of the `clients` table as migration 04 leaves it. Deliberately not the shared
 * `Client` type: that one is camelCase and derived from Zod, these are the raw
 * snake_case columns, and the controllers do the mapping between them.
 */
export interface ClientRow {
    id: string;
    hostname: string | null;
    display_name: string | null;
    /**
     * Never the token itself (migration 18). Inbound: its SHA-256 hash, because the server
     * only has to recognise the token an agent presents. Outbound: encrypted with
     * SecretCrypto, because the server presents it itself when it dials -- read it with
     * outboundAuthToken().
     */
    auth_token: string | null;
    connection_mode: ConnectionMode;
    /** Inbound clients only: the IP or network their connections must come from. */
    inbound_allowed_ip: string | null;
    /** Outbound clients only: the address the server dials. */
    outbound_target_address: string | null;
    ip_address: string | null;
    version: string | null;
    /** The IANA time zone the agent reported on its last connect (migration 12). */
    timezone: string | null;
    last_seen: string | null;
    created_at: string;
    updated_at: string | null;
}

export class ClientRepository {
    static findAll(): ClientRow[] {
        return db.prepare("SELECT * FROM clients").all() as ClientRow[];
    }

    static findById(id: string): ClientRow | undefined {
        return db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as
            | ClientRow
            | undefined;
    }

    /**
     * Resolves the identity an agent presents when it connects. Both halves have to
     * match the same row: the id alone is no secret -- it is also the PBS `--backup-id`
     * and therefore readable from any snapshot name -- and the token alone would let a
     * client be whoever its token happens to belong to. Narrower than the other
     * finders, because this runs on every agent connect.
     *
     * The stored value is a hash, so the comparison runs on the hash of what was presented.
     * An outbound client's encrypted token never matches -- it has no business connecting
     * inbound.
     */
    static findByIdAndToken(
        id: string,
        token: string,
    ):
        | Pick<ClientRow, "id" | "inbound_allowed_ip" | "connection_mode">
        | undefined {
        return db
            .prepare(
                "SELECT id, inbound_allowed_ip, connection_mode FROM clients WHERE id = ? AND auth_token = ?",
            )
            .get(id, hashToken(token)) as
            | Pick<ClientRow, "id" | "inbound_allowed_ip" | "connection_mode">
            | undefined;
    }

    /** Clients the server dials itself. Reconnected on startup and after connection loss. */
    static findOutboundClients(): ClientRow[] {
        return db
            .prepare("SELECT * FROM clients WHERE connection_mode = 'outbound'")
            .all() as ClientRow[];
    }

    /**
     * Creates an inbound client. A plain INSERT, deliberately: this used to be an
     * upsert on the id the agent sent, which meant a caller holding a registration
     * token could name an existing client and have its auth token replaced. Now the
     * server picks the id, so a collision is a bug and should fail loudly.
     */
    static createInbound(
        id: string,
        hostname: string,
        authToken: string,
        allowedIp: string | null,
    ): void {
        db.prepare(
            `
            INSERT INTO clients (id, hostname, auth_token, inbound_allowed_ip, connection_mode, last_seen)
            VALUES (?, ?, ?, ?, 'inbound', datetime('now'))
        `,
        ).run(id, hostname, hashToken(authToken), allowedIp);
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
        ).run(
            id,
            hostname,
            outboundTargetAddress,
            encryptSecret(authToken),
            version,
        );
    }

    /**
     * The auth token the server presents to an outbound client, decrypted. Throws if it
     * cannot be decrypted (usually a changed tunnel.keySecret).
     */
    static outboundAuthToken(client: ClientRow): string | null {
        return client.auth_token ? decryptSecret(client.auth_token) : null;
    }

    static updateDisplayName(
        id: string,
        displayName: string,
    ): { changes: number } {
        return db
            .prepare("UPDATE clients SET display_name = ? WHERE id = ?")
            .run(displayName, id);
    }

    /**
     * Changes the address the server dials for an outbound client. Only meaningful for
     * those — an inbound client has no target address at all.
     */
    static updateOutboundTargetAddress(
        id: string,
        address: string,
    ): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET outbound_target_address = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'outbound'",
            )
            .run(address, id);
    }

    /**
     * Changes the address or network an inbound client's connections must come from.
     * Only meaningful for those -- an outbound client is dialed by the server and is
     * never checked against one.
     */
    static updateInboundAllowedIp(
        id: string,
        allowedIp: string | null,
    ): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET inbound_allowed_ip = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'inbound'",
            )
            .run(allowedIp, id);
    }

    static updateAuthSuccess(
        id: string,
        ipAddress: string,
        version: string | null,
        timezone: string | null,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, ip_address=?, version=?, timezone=? WHERE id=?",
        ).run(now, now, ipAddress, version, timezone, id);
    }

    /**
     * Same as updateAuthSuccess but without an IP: for outbound clients the server is
     * the connecting party, so there is no remote IP to record.
     */
    static updateOutboundAuthSuccess(
        id: string,
        version: string | null,
        timezone: string | null,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, version=?, timezone=? WHERE id=?",
        ).run(now, now, version, timezone, id);
    }

    /**
     * Called when a connection closes, so now is the last moment the agent was seen.
     * Without `last_seen` the field would keep the time the agent connected, and a client
     * that held the connection for a month would read "last seen 30 days ago" the second
     * it drops -- the one moment the field is actually looked at.
     */
    static updateLastSeen(id: string): void {
        const now = new Date().toISOString();
        db.prepare("UPDATE clients SET last_seen=?, updated_at=? WHERE id = ?").run(
            now,
            now,
            id,
        );
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    }
}
