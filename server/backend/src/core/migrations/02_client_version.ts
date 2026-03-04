export const migration02 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          ALTER TABLE clients ADD COLUMN version TEXT;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        // SQLite doesn't support DROP COLUMN in older versions easily,
        // but for this project we'll just leave it or handle it if needed.
        // Modern SQLite (3.35.0+) supports:
        // db.exec("ALTER TABLE clients DROP COLUMN version;");
        try {
            db.exec("ALTER TABLE clients DROP COLUMN version;");
        } catch (e) {
            console.warn(
                "Could not drop column 'version' (SQLite version too old?); skipping.",
            );
        }
    },
};
