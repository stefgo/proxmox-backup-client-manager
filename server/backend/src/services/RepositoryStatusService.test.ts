import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The repository module opens the database when it is imported.
vi.mock("../repositories/RepositoryConfigRepository.js", () => ({
    RepositoryConfigRepository: { findSecret: () => "s3cret" },
}));

const { RepositoryStatusService, pbsAuthHeader } = await import("./RepositoryStatusService.js");

type Repo = Parameters<typeof RepositoryStatusService.check>[0];

const repo = (over: Partial<Repo> = {}): Repo =>
    ({
        id: "r1",
        base_url: "https://pbs.lan:8007/",
        datastore: "store",
        username: "backup@pbs",
        tokenname: "ha",
        ...over,
    }) as Repo;

const fetchMock = vi.fn();

beforeEach(() => {
    RepositoryStatusService.reset();
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("check", () => {
    it("asks the datastore's status with the repository's token", async () => {
        expect(await RepositoryStatusService.check(repo())).toBe("online");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://pbs.lan:8007/api2/json/admin/datastore/store/status",
            expect.objectContaining({ headers: { Authorization: "PBSAPIToken backup@pbs!ha:s3cret" } }),
        );
    });

    it("counts an error answer, a failure and an incomplete record as offline", async () => {
        fetchMock.mockResolvedValueOnce({ ok: false });
        expect(await RepositoryStatusService.check(repo())).toBe("offline");
        fetchMock.mockRejectedValueOnce(new Error("aborted"));
        expect(await RepositoryStatusService.check(repo())).toBe("offline");
        expect(await RepositoryStatusService.check(repo({ datastore: "" }))).toBe("offline");
    });
});

describe("cached", () => {
    it("reuses a check for 30 seconds, then asks again", async () => {
        const now = Date.now();
        expect(await RepositoryStatusService.cached(repo(), now)).toBe("online");
        fetchMock.mockResolvedValue({ ok: false });
        expect(await RepositoryStatusService.cached(repo(), now + 29_000)).toBe("online");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await RepositoryStatusService.cached(repo(), now + 31_000)).toBe("offline");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("asks once for readers that ask together", async () => {
        const [a, b] = await Promise.all([RepositoryStatusService.cached(repo()), RepositoryStatusService.cached(repo())]);
        expect([a, b]).toEqual(["online", "online"]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("pbsAuthHeader", () => {
    it("falls back to the token name `token`", () => {
        expect(pbsAuthHeader(repo({ tokenname: "" }))).toBe("PBSAPIToken backup@pbs!token:s3cret");
    });
});
