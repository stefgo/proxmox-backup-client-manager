export const migration04 = {
    up: async ({ context: db }: { context: any }) => {
        // All clients that exist before this migration were inbound-only: they dial the
        // server themselves and are pinned to the IP they registered from (allowed_ip).
        // Outbound clients are dialed BY the server and therefore have no registered IP.
        db.exec(`
            CREATE TABLE clients_new (
                id TEXT PRIMARY KEY,
                hostname TEXT,
                display_name TEXT,
                auth_token TEXT UNIQUE,
                connection_mode TEXT NOT NULL DEFAULT 'inbound',
                inbound_registered_ip TEXT,
                outbound_target_address TEXT,
                ip_address TEXT,
                version TEXT,
                last_seen DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO clients_new (id, hostname, display_name, auth_token, connection_mode,
                                     inbound_registered_ip, ip_address, version, last_seen, created_at, updated_at)
                SELECT id, hostname, display_name, auth_token,
                    'inbound',
                    allowed_ip,
                    ip_address, version, last_seen, created_at, updated_at
                FROM clients;
            DROP TABLE clients;
            ALTER TABLE clients_new RENAME TO clients;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            CREATE TABLE clients_old (
                id TEXT PRIMARY KEY,
                hostname TEXT,
                display_name TEXT,
                auth_token TEXT UNIQUE,
                allowed_ip TEXT,
                ip_address TEXT,
                version TEXT,
                last_seen DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO clients_old (id, hostname, display_name, auth_token, allowed_ip,
                                     ip_address, version, last_seen, created_at, updated_at)
                SELECT id, hostname, display_name, auth_token,
                    inbound_registered_ip,
                    ip_address, version, last_seen, created_at, updated_at
                FROM clients;
            DROP TABLE clients;
            ALTER TABLE clients_old RENAME TO clients;
        `);
    },
};
