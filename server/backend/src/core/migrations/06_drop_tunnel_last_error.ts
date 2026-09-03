export const migration06 = {
    up: async ({ context: db }: { context: any }) => {
        // The last tunnel error is runtime state, not a fact about the client: it is
        // produced by a failed connect attempt and is meaningless once the process that
        // made the attempt is gone. TunnelService already keeps it in its in-memory entry
        // and the dashboard reads it from there, so the column was a second, staler copy.
        db.exec(`ALTER TABLE client_tunnels DROP COLUMN last_error;`);
    },
    down: async ({ context: db }: { context: any }) => {
        // Restored empty — the historical values are gone and cannot be reconstructed.
        db.exec(`ALTER TABLE client_tunnels ADD COLUMN last_error TEXT;`);
    },
};
