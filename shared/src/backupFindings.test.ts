import { describe, expect, it } from "vitest";
import { backupStatus, buildFindings, existingJobRuns, jobIdOf, parseTimestamp } from "./backupFindings.js";
import type { Client } from "./types.js";

// The dashboard's tests (server/frontend/src/features/dashboard/lib/findings.test.ts) check
// every finding's text through the dashboard's own `buildFindings`; these check what the
// server reads of them: where each leads, the verdict, and the runs that count.

const NOW = Date.parse("2026-10-27T10:00:00.000Z");

const client = (id: string, over: Partial<Client> = {}): Client =>
    ({
        id,
        hostname: id,
        displayName: null,
        status: "online",
        connectionMode: "inbound",
        lastSeen: "2026-10-27T09:59:00.000Z",
        ...over,
    }) as Client;

describe("buildFindings", () => {
    it("names where each finding can be dealt with, without a path of the dashboard", () => {
        const found = buildFindings({
            clients: [client("pve1"), client("pve2", { status: "offline" })],
            repositories: [{ id: 7, baseUrl: "https://pbs", datastore: "store", status: "offline" }],
            jobs: [
                {
                    clientId: "pve1",
                    id: "j1",
                    name: "Nightly",
                    schedule: { type: "daily" } as never,
                    scheduleEnabled: true,
                    nextRunAt: "2026-10-27T09:00:00.000Z",
                },
            ],
            knownClients: ["pve1"],
            latest: [{ clientId: "pve1", jobId: "j2", name: "Weekly", status: "failed", startTime: "2026-10-27T03:00:00.000Z", endTime: null }],
            now: NOW,
        });
        expect(found.map((f) => [f.type, f.target])).toEqual([
            ["client-offline", { kind: "client", clientId: "pve2" }],
            ["repository-offline", { kind: "repository", id: 7 }],
            ["run-failed", { kind: "client-history", clientId: "pve1" }],
            ["run-overdue", { kind: "job", clientId: "pve1", jobId: "j1" }],
        ]);
    });
});

describe("backupStatus", () => {
    it("is unknown without a registered client, then follows the worst finding", () => {
        expect(backupStatus([], [client("a", { lastSeen: null })])).toBe("unknown");
        expect(backupStatus([], [client("a")])).toBe("healthy");
        expect(backupStatus([{ severity: "warning" }], [client("a")])).toBe("degraded");
        expect(backupStatus([{ severity: "error" }], [client("a")])).toBe("critical");
    });
});

describe("existingJobRuns", () => {
    it("drops the runs of deleted jobs only where the client's jobs are known", () => {
        const runs = [
            { clientId: "known", jobId: "kept", status: "success", startTime: "x", endTime: null },
            { clientId: "known", jobId: "gone", status: "failed", startTime: "x", endTime: null },
            { clientId: "away", jobId: "any", status: "failed", startTime: "x", endTime: null },
        ];
        expect(existingJobRuns(runs, [{ clientId: "known", id: "kept" }], ["known"]).map(jobIdOf)).toEqual(["kept", "any"]);
    });
});

describe("parseTimestamp", () => {
    it("reads SQLite's format as UTC", () => {
        expect(parseTimestamp("2026-10-27 10:00:00")?.toISOString()).toBe("2026-10-27T10:00:00.000Z");
        expect(parseTimestamp("")).toBeNull();
        expect(parseTimestamp("not a date")).toBeNull();
    });
});
