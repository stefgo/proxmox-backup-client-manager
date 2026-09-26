import db from "../core/Database.js";

/** When each user last opened the job history (migration 14). */
export class HistorySeenRepository {
    /** The user's last look as an ISO timestamp, or null if they never opened it. */
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
}
