export const migration08 = {
    up: async ({ context: db }: { context: any }) => {
        // Until now the tunnel was implied by clients.connection_mode: outbound meant
        // "always tunnelled", inbound meant "never". That tied two independent things
        // together — the mode says who dials the WebSocket, the tunnel is the route to
        // the PBS — and made the tunnel unavailable to inbound clients that cannot reach
        // the PBS themselves. It is its own switch now.
        //
        // DEFAULT 1 keeps the existing rows meaning what they meant: every tunnel stored
        // so far belongs to an outbound client and was in use.
        db.exec(`
            ALTER TABLE client_tunnels
                ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE client_tunnels DROP COLUMN enabled;`);
    },
};
