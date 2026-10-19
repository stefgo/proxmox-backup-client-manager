import crypto from "crypto";
import db from "../core/Database.js";
import { ConnectionMode } from "@pbcm/shared";
import { decryptSecret, encryptSecret } from "../services/SecretCrypto.js";

/**
 * How a token the server only has to recognise is stored: an inbound agent's auth token and
 * a registration token alike. The value itself is shown once; the table holds its SHA-256.
 */
export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

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
    /**
     * Inbound clients only (migration 21): SHA-256 of the registration token issued for this
     * client, or null when none is open. Cleared by the registration that uses it.
     */
    registration_token_hash: string | null;
    /** Until when that token is valid, as ISO text. Kept after it expires, for the page. */
    registration_expires_at: string | null;
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
     * Creates an inbound client that waits for its agent: no hostname, no auth token and
     * never seen. The registration token is set separately, by setRegistrationToken. A
     * null `allowedIp` leaves the address check off, for the registration and after it.
     */
    static createPendingInbound(id: string, displayName: string, allowedIp: string | null): void {
        db.prepare(
            `
            INSERT INTO clients (id, display_name, inbound_allowed_ip, connection_mode)
            VALUES (?, ?, ?, 'inbound')
        `,
        ).run(id, displayName, allowedIp);
    }

    /**
     * Opens a registration for an inbound client, replacing a token that was still open.
     * Only the hash is stored. Restricted to inbound rows in SQL: an outbound agent is
     * registered by the server dialling it, never with a token.
     */
    static setRegistrationToken(id: string, token: string, expiresAt: string): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET registration_token_hash = ?, registration_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'inbound'",
            )
            .run(hashToken(token), expiresAt, id);
    }

    /**
     * The inbound client a registration token was issued for, while the token is valid.
     * The expiry goes through datetime(): it is written as ISO text, and compared as a
     * plain string with SQLite's own format the two disagree within the same day.
     */
    static findByValidRegistrationToken(
        token: string,
    ): Pick<ClientRow, "id" | "auth_token" | "inbound_allowed_ip"> | undefined {
        return db
            .prepare(
                "SELECT id, auth_token, inbound_allowed_ip FROM clients WHERE registration_token_hash = ? AND connection_mode = 'inbound' AND datetime(registration_expires_at) > datetime('now')",
            )
            .get(hashToken(token)) as Pick<ClientRow, "id" | "auth_token" | "inbound_allowed_ip"> | undefined;
    }

    /**
     * Binds the agent that presented `token` to the client it was issued for: the hostname
     * it reported, the auth token the server issued for it, and the token cleared, so it
     * registers nothing a second time. Matched on the token in the same statement, so of two
     * agents racing with one token only the first gets the client.
     *
     * The allowed address is left alone: it is the operator's decision, made when the client
     * was created or since, and the address an agent happens to register from is none.
     *
     * Returns false when the token was no longer valid.
     */
    static completeRegistration(id: string, token: string, hostname: string, authToken: string): boolean {
        const { changes } = db
            .prepare(
                `
                UPDATE clients SET
                    hostname = ?,
                    auth_token = ?,
                    registration_token_hash = NULL,
                    registration_expires_at = NULL,
                    last_seen = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                  AND connection_mode = 'inbound'
                  AND registration_token_hash = ?
                  AND datetime(registration_expires_at) > datetime('now')
            `,
            )
            .run(hostname, hashToken(authToken), id, hashToken(token));
        return changes > 0;
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
     * cannot be decrypted (usually a changed secretKey).
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
