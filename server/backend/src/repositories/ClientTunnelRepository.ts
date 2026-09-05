import db from "../core/Database.js";
import { decryptSecret, encryptSecret } from "../services/SecretCrypto.js";

export interface ClientTunnelRow {
    client_id: string;
    ssh_host: string;
    ssh_port: number;
    ssh_user: string;
    private_key: string;
    passphrase: string | null;
    host_key_sha256: string;
    remote_bind_host: string;
    /** SQLite has no boolean: 1 = runs go through the tunnel, 0 = credentials parked. */
    enabled: number;
    last_used_at: string | null;
}

/** SSH parameters with secrets already decrypted — never leaves the backend. */
export interface TunnelCredentials {
    clientId: string;
    sshHost: string;
    sshPort: number;
    sshUser: string;
    privateKey: string;
    passphrase?: string;
    hostKeySha256: string;
    remoteBindHost: string;
}

export class ClientTunnelRepository {
    static findByClientId(clientId: string): ClientTunnelRow | undefined {
        return db
            .prepare("SELECT * FROM client_tunnels WHERE client_id = ?")
            .get(clientId) as ClientTunnelRow | undefined;
    }

    /**
     * Returns the tunnel parameters with private key and passphrase decrypted.
     * Throws if the secrets cannot be decrypted (usually a changed tunnel.keySecret).
     */
    /**
     * Whether this client's runs must go through the tunnel. The one question the rest
     * of the backend asks — deliberately not `connection_mode`, which only says who
     * dials the WebSocket. Credentials without the flag are parked, not in use.
     */
    static isEnabled(clientId: string): boolean {
        const row = db
            .prepare("SELECT enabled FROM client_tunnels WHERE client_id = ?")
            .get(clientId) as { enabled: number } | undefined;
        return !!row?.enabled;
    }

    /** Every client that has SSH credentials stored, enabled or not. */
    static findAllClientIds(): string[] {
        return (
            db.prepare("SELECT client_id FROM client_tunnels").all() as {
                client_id: string;
            }[]
        ).map((r) => r.client_id);
    }

    /** Every client that currently routes through a tunnel. */
    static findEnabledClientIds(): string[] {
        return (
            db
                .prepare("SELECT client_id FROM client_tunnels WHERE enabled = 1")
                .all() as { client_id: string }[]
        ).map((r) => r.client_id);
    }

    static setEnabled(clientId: string, enabled: boolean): { changes: number } {
        return db
            .prepare(
                "UPDATE client_tunnels SET enabled = ?, updated_at = datetime('now') WHERE client_id = ?",
            )
            .run(enabled ? 1 : 0, clientId);
    }

    static findCredentials(clientId: string): TunnelCredentials | undefined {
        const row = this.findByClientId(clientId);
        if (!row) return undefined;

        return {
            clientId: row.client_id,
            sshHost: row.ssh_host,
            sshPort: row.ssh_port,
            sshUser: row.ssh_user,
            privateKey: decryptSecret(row.private_key),
            passphrase: row.passphrase
                ? decryptSecret(row.passphrase)
                : undefined,
            hostKeySha256: row.host_key_sha256,
            remoteBindHost: row.remote_bind_host,
        };
    }

    static create(
        clientId: string,
        data: {
            sshHost: string;
            sshPort?: number;
            sshUser: string;
            privateKey: string;
            passphrase?: string;
            hostKeySha256: string;
            remoteBindHost?: string;
            /** Defaults to on: a tunnel is configured in order to be used. */
            enabled?: boolean;
        },
    ): void {
        db.prepare(
            `
            INSERT INTO client_tunnels
                (client_id, ssh_host, ssh_port, ssh_user, private_key, passphrase, host_key_sha256, remote_bind_host, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
            clientId,
            data.sshHost,
            data.sshPort ?? 22,
            data.sshUser,
            encryptSecret(data.privateKey),
            data.passphrase ? encryptSecret(data.passphrase) : null,
            data.hostKeySha256,
            data.remoteBindHost ?? "127.0.0.1",
            data.enabled === false ? 0 : 1,
        );
    }

    /**
     * Updates the SSH credentials and the enabled flag. Tunnel target and bind port stay
     * out of it by design: the target follows from each job's repository, the port is
     * allocated per forward.
     */
    static update(
        clientId: string,
        data: {
            sshHost?: string;
            sshPort?: number;
            sshUser?: string;
            privateKey?: string;
            passphrase?: string | null;
            hostKeySha256?: string;
            enabled?: boolean;
        },
    ): { changes: number } {
        const sets: string[] = [];
        const values: any[] = [];

        if (data.sshHost !== undefined) {
            sets.push("ssh_host = ?");
            values.push(data.sshHost);
        }
        if (data.sshPort !== undefined) {
            sets.push("ssh_port = ?");
            values.push(data.sshPort);
        }
        if (data.sshUser !== undefined) {
            sets.push("ssh_user = ?");
            values.push(data.sshUser);
        }
        if (data.privateKey !== undefined) {
            sets.push("private_key = ?");
            values.push(encryptSecret(data.privateKey));
        }
        if (data.passphrase !== undefined) {
            sets.push("passphrase = ?");
            values.push(data.passphrase ? encryptSecret(data.passphrase) : null);
        }
        if (data.hostKeySha256 !== undefined) {
            sets.push("host_key_sha256 = ?");
            values.push(data.hostKeySha256);
        }
        if (data.enabled !== undefined) {
            sets.push("enabled = ?");
            values.push(data.enabled ? 1 : 0);
        }

        if (sets.length === 0) return { changes: 0 };

        sets.push("updated_at = datetime('now')");
        values.push(clientId);

        return db
            .prepare(
                `UPDATE client_tunnels SET ${sets.join(", ")} WHERE client_id = ?`,
            )
            .run(...values);
    }

    static recordUse(clientId: string): void {
        db.prepare(
            "UPDATE client_tunnels SET last_used_at = datetime('now') WHERE client_id = ?",
        ).run(clientId);
    }

    static delete(clientId: string): { changes: number } {
        return db
            .prepare("DELETE FROM client_tunnels WHERE client_id = ?")
            .run(clientId);
    }
}
