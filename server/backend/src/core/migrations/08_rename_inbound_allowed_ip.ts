export const migration08 = {
    up: async ({ context: db }: { context: any }) => {
        // Migration 04 named the column after where the value came from: back then it was
        // always the address the agent had registered from. Since migration 07 the
        // registration token carries an `allowed_ip` and that one wins -- the value is a
        // decision the operator made, not an observation, and it may be a network rather
        // than a single address. `allowed` covers both cases and mirrors
        // `registration_tokens.allowed_ip`, which is where the value now comes from.
        db.exec(
            `ALTER TABLE clients RENAME COLUMN inbound_registered_ip TO inbound_allowed_ip;`,
        );
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(
            `ALTER TABLE clients RENAME COLUMN inbound_allowed_ip TO inbound_registered_ip;`,
        );
    },
};
