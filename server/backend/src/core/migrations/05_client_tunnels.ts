export const migration05 = {
    up: async ({ context: db }: { context: any }) => {
        // One row per outbound client — mandatory for those, forbidden for inbound ones.
        // (Superseded by migration 08: the tunnel is optional and available in both
        // connection modes, and the enabled flag left out here was added there.)
        // Deliberately absent: no enabled flag (derived from clients.connection_mode),
        // no bind port (allocated dynamically per forward), no tunnel target (resolved
        // per job from its repository) and no status (runtime-only, kept in memory).
        db.exec(`
            CREATE TABLE IF NOT EXISTS client_tunnels (
                client_id        TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
                ssh_host         TEXT NOT NULL,
                ssh_port         INTEGER NOT NULL DEFAULT 22,
                ssh_user         TEXT NOT NULL,
                private_key      TEXT NOT NULL,
                passphrase       TEXT,
                host_key_sha256  TEXT NOT NULL,
                remote_bind_host TEXT NOT NULL DEFAULT '127.0.0.1',
                last_error       TEXT,
                last_used_at     DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS client_tunnels;`);
    },
};
