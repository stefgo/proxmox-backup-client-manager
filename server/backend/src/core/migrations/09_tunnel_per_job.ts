export const migration09 = {
    up: async ({ context: db }: { context: any }) => {
        // Migration 08 gave the tunnel a per-client switch. It turned out to sit one level
        // too high: a client can have several repositories, and only some of them may need
        // the detour — so the route belongs to the job, which is where it is stored now
        // (BackupJobSchema.tunnel, kept in the agent's own job config).
        //
        // What stays here is the SSH credential set: stored means the tunnel is available
        // to this client's jobs. A second switch beside the job's own would only create
        // states in which the job setting visibly does not do what it says; the global
        // kill switch remains `tunnel.enabled` in config.yaml.
        db.exec(`ALTER TABLE client_tunnels DROP COLUMN enabled;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            ALTER TABLE client_tunnels
                ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
        `);
    },
};
