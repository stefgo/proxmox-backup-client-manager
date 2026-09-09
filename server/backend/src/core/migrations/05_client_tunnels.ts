export const migration05 = {
    up: async ({ context: db }: { context: any }) => {
        // The SSH credential set of one client. A stored row means the tunnel is
        // available to that client's jobs; whether a run takes it is decided per job
        // (BackupJobSchema.tunnel). Independent of clients.connection_mode: the mode
        // says who dials the WebSocket, the tunnel is the route to the PBS.
        //
        // Deliberately absent: no enabled flag (the job decides, and a second switch
        // beside it would only create states in which the job setting visibly does not
        // do what it says; the global kill switch is `tunnel.enabled` in config.yaml),
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
