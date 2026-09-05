import db from "../core/Database.js";

/**
 * State the server owns and the agent has to remember across restarts.
 *
 * Deliberately tiny and untyped at the storage level: everything in here is a value the
 * agent is told, never one it decides, so the schema that matters lives on the server.
 */
export class AgentStateRepository {
    private static get(key: string): string | undefined {
        const row = db
            .prepare("SELECT value FROM agent_state WHERE key = ?")
            .get(key) as { value: string | null } | undefined;
        return row?.value ?? undefined;
    }

    private static set(key: string, value: string): void {
        db.prepare(
            `INSERT INTO agent_state (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run(key, value);
    }

    /**
     * Whether runs have to go through the SSH reverse tunnel.
     *
     * Defaults to false for a client that has never been told: an agent that reaches the
     * PBS directly is the common case, and a wrong `true` would fail every scheduled run
     * while the server is unreachable. A wrong `false` fails too — the server refuses the
     * unauthorised route — but says so at the PBS, not before it starts.
     */
    static isTunnelRequired(): boolean {
        return this.get("tunnel_required") === "1";
    }

    static setTunnelRequired(required: boolean): void {
        this.set("tunnel_required", required ? "1" : "0");
    }
}
