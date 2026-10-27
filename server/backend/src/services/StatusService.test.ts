import { StatusReportSchema, type BackupJob, type Client, type GlobalHistoryEntry } from "@pbcm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.fn<() => Client[]>();
const cachedJobs = vi.fn<() => { clientId: string; jobs: BackupJob[] }[]>();
const latest = vi.fn<() => GlobalHistoryEntry[]>();
const repos = vi.fn<() => { id: string; base_url: string; datastore: string }[]>();
const reachability = vi.fn<(repo: { id: string }) => Promise<string>>();

// Every one of these reaches the database, the agents or the network when it is imported.
vi.mock("./ProxyService.js", () => ({
    ProxyService: { getClientsWithStatus: () => clients(), getAllCachedJobs: () => cachedJobs() },
}));
vi.mock("../repositories/JobHistoryRepository.js", () => ({ JobHistoryRepository: { findLatestPerJob: () => latest() } }));
vi.mock("../repositories/RepositoryConfigRepository.js", () => ({ RepositoryConfigRepository: { findAll: () => repos() } }));
vi.mock("./RepositoryStatusService.js", () => ({
    RepositoryStatusService: { cached: (repo: { id: string }) => reachability(repo) },
}));

const { StatusService } = await import("./StatusService.js");

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

const job = (id: string): BackupJob =>
    ({ id, name: `Job ${id}`, schedule: null, scheduleEnabled: false }) as unknown as BackupJob;

const run = (clientId: string, jobId: string, status: string): GlobalHistoryEntry =>
    ({
        id: `${clientId}-${jobId}`,
        clientId,
        jobId,
        name: `Job ${jobId}`,
        status,
        startTime: "2026-10-27T03:00:00.000Z",
        endTime: "2026-10-27T03:05:00.000Z",
    }) as GlobalHistoryEntry;

beforeEach(() => {
    clients.mockReset().mockReturnValue([]);
    cachedJobs.mockReset().mockReturnValue([]);
    latest.mockReset().mockReturnValue([]);
    repos.mockReset().mockReturnValue([]);
    reachability.mockReset().mockResolvedValue("online");
});

describe("StatusService.report", () => {
    it("is unknown without a registered client", async () => {
        const report = await StatusService.report(NOW);
        expect(StatusReportSchema.parse(report)).toEqual(report);
        expect(report).toMatchObject({ app: "pbcm", status: "unknown", findings: [] });
    });

    it("is healthy with every job's last run a success, and sums up the cards", async () => {
        cachedJobs.mockReturnValue([{ clientId: "pve1", jobs: [job("j1"), job("j2")] }]);
        latest.mockReturnValue([run("pve1", "j1", "success")]);
        repos.mockReturnValue([{ id: "r1", base_url: "https://pbs", datastore: "store" }]);
        clients.mockReturnValue([client("pve1")]);

        const report = await StatusService.report(NOW);

        expect(report.status).toBe("healthy");
        expect(report.summary).toEqual({
            clients: { online: 1, total: 1 },
            repositories: { online: 1, total: 1 },
            jobsActive: 2,
        });
    });

    it("lists the dashboard's lines, errors first", async () => {
        clients.mockReturnValue([client("pve1")]);
        cachedJobs.mockReturnValue([{ clientId: "pve1", jobs: [job("j1")] }]);
        latest.mockReturnValue([run("pve1", "j1", "failed")]);
        repos.mockReturnValue([{ id: "r1", base_url: "https://pbs:8007", datastore: "store" }]);
        reachability.mockResolvedValue("offline");

        const report = await StatusService.report(NOW);

        expect(report.status).toBe("critical");
        expect(report.counts).toEqual({ error: 2, warning: 0 });
        expect(report.findings).toEqual([
            {
                id: "repository-offline:r1",
                type: "repository-offline",
                severity: "error",
                text: "The repository store at https://pbs:8007 does not answer",
                since: null,
            },
            {
                id: "run-failed:pve1:j1",
                type: "run-failed",
                severity: "error",
                text: 'The last run of "Job j1" on pve1 failed',
                since: "2026-10-27T03:05:00.000Z",
            },
        ]);
    });

    it("leaves out the last run of a job that was deleted", async () => {
        clients.mockReturnValue([client("pve1")]);
        cachedJobs.mockReturnValue([{ clientId: "pve1", jobs: [job("j1")] }]);
        latest.mockReturnValue([run("pve1", "gone", "failed")]);

        expect((await StatusService.report(NOW)).status).toBe("healthy");
    });
});
