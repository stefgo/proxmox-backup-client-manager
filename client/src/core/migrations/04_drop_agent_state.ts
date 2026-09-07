export const migration04 = {
    up: async ({ context: db }: { context: any }) => {
        // Migration 03 introduced this table for `tunnel_required`, back when the route to
        // the PBS was a property of the whole agent. It is a property of each job instead,
        // and travels in the job's own config — so nothing reads this any more.
        db.exec(`DROP TABLE IF EXISTS agent_state;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS agent_state (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        `);
    },
};
