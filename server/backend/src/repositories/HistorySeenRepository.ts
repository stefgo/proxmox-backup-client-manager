import db from "../core/Database.js";

/**
 * What each user has marked as seen: a mark in time (`history_seen`, migration 14) below
 * which everything is seen, and the single runs above it (`history_seen_runs`, migration 20).
 */
export class HistorySeenRepository {
    /** The user's mark as an ISO timestamp, or null if they have none. */
    static get(username: string): string | null {
        const row = db
            .prepare("SELECT seen_at FROM history_seen WHERE username = ?")
            .get(username) as { seen_at: string } | undefined;
        return row?.seen_at ?? null;
    }

    static set(username: string, seenAt: string): void {
        db.prepare(
            `
            INSERT INTO history_seen (username, seen_at) VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET seen_at = excluded.seen_at
        `,
        ).run(username, seenAt);
    }

    /** Marks one run as seen. Marking it twice is the same as once. */
    static markRun(username: string, historyId: string): void {
        db.prepare(
            "INSERT OR IGNORE INTO history_seen_runs (username, history_id) VALUES (?, ?)",
        ).run(username, historyId);
    }

    /**
     * Everything up to `seenAt` is seen. The single runs go: they all lie below the mark
     * now, and one that does not -- an agent's clock ahead of the server's -- was on the
     * screen the user just cleared.
     */
    static markAll(username: string, seenAt: string): void {
        db.transaction(() => {
            this.set(username, seenAt);
            db.prepare("DELETE FROM history_seen_runs WHERE username = ?").run(username);
        })();
    }

    /** Forgets the user, so one created under the same name later starts from its own mark. */
    static deleteForUser(username: string): void {
        db.prepare("DELETE FROM history_seen_runs WHERE username = ?").run(username);
        db.prepare("DELETE FROM history_seen WHERE username = ?").run(username);
    }
}
