export const migration03 = {
    up: async ({ context: db }: { context: any }) => {
        // Small key/value store for state the server owns but the agent has to survive a
        // restart with. The first entry is `tunnel_required`: whether runs go through the
        // SSH reverse tunnel. It used to be written into every job config, which was only
        // safe while the route could never change after the client was created.
        //
        // Not config.yaml on purpose — that file belongs to the operator, and a value the
        // server overwrites on every connect has no place in it.
        db.exec(`
            CREATE TABLE IF NOT EXISTS agent_state (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS agent_state;`);
    },
};
