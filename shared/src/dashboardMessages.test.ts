import { describe, expect, it } from "vitest";
import { DashboardMessageSchema, type DashboardMessage } from "./dashboardMessages.js";

const client = {
    id: "c1",
    hostname: "pbs-client",
    status: "online",
    lastSeen: "2026-10-03 08:00:00",
};

const job = {
    id: "j1",
    name: "etc",
    schedule: null,
    scheduleEnabled: false,
    archives: [{ path: "/etc", name: "etc" }],
    repository: { baseUrl: "https://pbs:8007", datastore: "main", username: "root@pam", secret: "" },
};

const status = { isRunning: false, nextRun: null, lastRun: null };

/** One valid message per type. A type added to the union has to be added here. */
const VALID: { [T in DashboardMessage["type"]]: unknown } = {
    CLIENTS_UPDATE: { type: "CLIENTS_UPDATE", payload: [client] },
    JOBS_UPDATE: { type: "JOBS_UPDATE", payload: { clientId: "c1", jobs: [job] } },
    TUNNEL_UPDATE: {
        type: "TUNNEL_UPDATE",
        payload: { clientId: "c1", status: "up", activeLeases: 1, forwards: [{ target: "pbs:8007", port: 40001 }] },
    },
    JOB_UPDATE: {
        type: "JOB_UPDATE",
        payload: {
            clientId: "c1",
            job: { id: "r1", name: "etc", status: "running", type: "backup", startTime: "2026-10-03T08:00:00Z" },
        },
    },
    LOG_UPDATE: {
        type: "LOG_UPDATE",
        payload: { clientId: "c1", jobId: "r1", output: "line\n", stream: "stdout" },
    },
    JOB_NEXT_RUN_UPDATE: {
        type: "JOB_NEXT_RUN_UPDATE",
        payload: { clientId: "c1", jobId: "j1", nextRunAt: null },
    },
    HISTORY_SEEN: {
        type: "HISTORY_SEEN",
        payload: { username: "admin", seenAt: null, unseenFailed: 0 },
    },
    WEBHOOKS_UPDATE: { type: "WEBHOOKS_UPDATE" },
    SCHEDULER_STATUS_UPDATE: {
        type: "SCHEDULER_STATUS_UPDATE",
        payload: { scheduler: "token-cleanup", status },
    },
};

describe("DashboardMessageSchema", () => {
    it.each(Object.entries(VALID))("accepts %s", (_type, message) => {
        expect(DashboardMessageSchema.safeParse(message).success).toBe(true);
    });

    it("rejects a type it does not know", () => {
        expect(DashboardMessageSchema.safeParse({ type: "SOMETHING_NEW", payload: {} }).success).toBe(false);
    });

    it("rejects a message without its payload", () => {
        expect(DashboardMessageSchema.safeParse({ type: "TUNNEL_UPDATE" }).success).toBe(false);
    });

    it("rejects a payload of the wrong shape", () => {
        const message = { type: "LOG_UPDATE", payload: { clientId: "c1", jobId: "r1", output: 1, stream: "stdout" } };
        expect(DashboardMessageSchema.safeParse(message).success).toBe(false);
    });

    it("rejects a scheduler the server does not run", () => {
        const message = { type: "SCHEDULER_STATUS_UPDATE", payload: { scheduler: "backup", status } };
        expect(DashboardMessageSchema.safeParse(message).success).toBe(false);
    });

    // A row read out of SQLite carries null where the column is empty, not a missing key.
    it("accepts a client whose nullable columns are null", () => {
        const row = {
            ...client,
            displayName: null,
            lastSeen: null,
            version: null,
            ipAddress: null,
            timezone: null,
            outboundTargetAddress: null,
            inboundAllowedIp: null,
            updatedAt: null,
        };
        expect(DashboardMessageSchema.safeParse({ type: "CLIENTS_UPDATE", payload: [row] }).success).toBe(true);
    });

    // An agent stores a job's config as it was saved, by whatever version saved it; a name
    // the editor refuses today must not take the client's whole job list off the screen.
    it("accepts a job that would not pass the editor's input rules", () => {
        const legacy = { ...job, id: "not-a-uuid", archives: [{ path: "relative", name: ".hidden" }] };
        const message = { type: "JOBS_UPDATE", payload: { clientId: "c1", jobs: [legacy] } };
        expect(DashboardMessageSchema.safeParse(message).success).toBe(true);
    });

    it("fills in the lists an older job does not carry", () => {
        const parsed = DashboardMessageSchema.parse(VALID.JOBS_UPDATE);
        expect(parsed.type === "JOBS_UPDATE" && parsed.payload.jobs[0].excludes).toEqual([]);
    });

    it("drops a field the union does not describe", () => {
        const parsed = DashboardMessageSchema.parse({ type: "WEBHOOKS_UPDATE", payload: { extra: true } });
        expect(parsed).toEqual({ type: "WEBHOOKS_UPDATE" });
    });
});
