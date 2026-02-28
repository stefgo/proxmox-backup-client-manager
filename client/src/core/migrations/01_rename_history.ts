export const migration01 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
            ALTER TABLE history RENAME TO job_history;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            ALTER TABLE job_history RENAME TO history;
        `);
    },
};
