export const migration07 = {
    up: async ({ context: db }: { context: any }) => {
        // What a registration token carries the client cannot supply itself. The
        // display name used to be set by hand after the fact, and the IP pin was
        // whatever address the agent happened to register from -- neither was a
        // decision anyone made. Both are now captured with the token, which is
        // the only moment an operator is present.
        //
        // Nullable on purpose: a token created without either keeps the old
        // behaviour, so tokens issued before this migration stay valid.
        db.exec(`ALTER TABLE registration_tokens ADD COLUMN display_name TEXT;`);
        db.exec(`ALTER TABLE registration_tokens ADD COLUMN allowed_ip TEXT;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE registration_tokens DROP COLUMN display_name;`);
        db.exec(`ALTER TABLE registration_tokens DROP COLUMN allowed_ip;`);
    },
};
