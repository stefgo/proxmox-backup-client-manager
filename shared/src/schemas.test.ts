import { describe, expect, it } from "vitest";
import {
    AbortRunRequestSchema,
    ClientUpdateSchema,
    HistoryQuerySchema,
    RepositoryInputSchema,
    RestoreRequestSchema,
    SnapshotQuerySchema,
    TunnelUpdateSchema,
} from "./schemas.js";

describe("RepositoryInputSchema", () => {
    const repository = {
        baseUrl: "https://pbs.example.com:8007",
        datastore: "backups",
        fingerprint: "",
        username: "root@pam",
        tokenname: "",
    };

    it("accepts an update without a secret: the stored one is kept", () => {
        expect(RepositoryInputSchema.safeParse(repository).success).toBe(true);
    });

    it("accepts a secret, to set or change it", () => {
        expect(RepositoryInputSchema.parse({ ...repository, secret: "s3cret" }).secret).toBe("s3cret");
    });

    it("refuses a repository without a datastore", () => {
        const parsed = RepositoryInputSchema.safeParse({ ...repository, datastore: "" });
        expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["datastore"]]);
    });
});

describe("ClientUpdateSchema", () => {
    it("normalises the target address it accepts", () => {
        expect(ClientUpdateSchema.parse({ outboundTargetAddress: " 10.0.0.5 " })).toEqual({
            outboundTargetAddress: "10.0.0.5:3001",
        });
    });

    it("refuses a target address with a path", () => {
        const parsed = ClientUpdateSchema.safeParse({ outboundTargetAddress: "10.0.0.5/ws" });
        expect(parsed.error?.issues[0]?.message).toBe(
            "Must be a host or host:port, without scheme, path or credentials",
        );
    });

    it("tells an allowed address switched off from one left alone", () => {
        expect(ClientUpdateSchema.parse({ inboundAllowedIp: null })).toEqual({ inboundAllowedIp: null });
        expect(ClientUpdateSchema.parse({})).toEqual({});
    });
});

describe("TunnelUpdateSchema", () => {
    it("takes null as a passphrase: the stored one is cleared", () => {
        expect(TunnelUpdateSchema.parse({ passphrase: null })).toEqual({ passphrase: null });
    });

    it("leaves every field out of an update that names none", () => {
        expect(TunnelUpdateSchema.parse({})).toEqual({});
    });
});

describe("HistoryQuerySchema", () => {
    it("reads the page from the query string, where every value is text", () => {
        expect(HistoryQuerySchema.parse({ limit: "20", offset: "40" })).toEqual({ limit: 20, offset: 40 });
    });

    it("falls back to the first hundred rows", () => {
        expect(HistoryQuerySchema.parse({})).toEqual({ limit: 100, offset: 0 });
    });

    it("refuses a negative limit, which SQLite reads as no limit", () => {
        expect(HistoryQuerySchema.safeParse({ limit: "-1" }).success).toBe(false);
    });

    it("refuses a limit that is not a number", () => {
        expect(HistoryQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    });

    it("takes a status and a client to filter by", () => {
        expect(HistoryQuerySchema.parse({ status: "failed", clientId: "c1" })).toMatchObject({
            status: "failed",
            clientId: "c1",
        });
    });

    it("refuses a status no run can have, rather than answering with an empty page", () => {
        expect(HistoryQuerySchema.safeParse({ status: "broken" }).success).toBe(false);
    });

    it("refuses an empty client id, which would match no run", () => {
        expect(HistoryQuerySchema.safeParse({ clientId: "" }).success).toBe(false);
    });

    it("takes a text to search for, without the blanks around it", () => {
        expect(HistoryQuerySchema.parse({ search: "  nightly " })).toMatchObject({ search: "nightly" });
    });

    it("refuses a search for nothing but blanks, which would match every run", () => {
        expect(HistoryQuerySchema.safeParse({ search: "   " }).success).toBe(false);
    });

    it("refuses a search text longer than a name can be", () => {
        expect(HistoryQuerySchema.safeParse({ search: "x".repeat(201) }).success).toBe(false);
    });
});

describe("SnapshotQuerySchema", () => {
    it("asks for every snapshot when no backup id is named", () => {
        expect(SnapshotQuerySchema.parse({})).toEqual({});
    });

    it("takes the backup id to filter by", () => {
        expect(SnapshotQuerySchema.parse({ backupId: "c1" })).toEqual({ backupId: "c1" });
    });

    it("refuses an empty backup id", () => {
        expect(SnapshotQuerySchema.safeParse({ backupId: "" }).success).toBe(false);
    });
});

describe("RestoreRequestSchema", () => {
    const request = {
        snapshot: "host/c1/2026-01-02T03:04:05Z",
        targetPath: "/restore",
        repositoryId: "7",
        archives: ["root.pxar"],
    };

    it("accepts a restore that names its repository", () => {
        expect(RestoreRequestSchema.safeParse(request).success).toBe(true);
    });

    it("refuses a target that is not absolute", () => {
        const parsed = RestoreRequestSchema.safeParse({ ...request, targetPath: "restore" });
        expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["targetPath"]]);
    });

    it("refuses a restore without a repository", () => {
        const parsed = RestoreRequestSchema.safeParse({ ...request, repositoryId: "" });
        expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["repositoryId"]]);
    });

    it("refuses a snapshot that would be read as an option", () => {
        expect(RestoreRequestSchema.safeParse({ ...request, snapshot: "--repository=x" }).success).toBe(false);
    });
});

describe("AbortRunRequestSchema", () => {
    it("names the run to stop", () => {
        expect(AbortRunRequestSchema.parse({ requestId: "r1", runId: "run-1" })).toEqual({
            requestId: "r1",
            runId: "run-1",
        });
    });

    it("refuses a request that names no run", () => {
        expect(AbortRunRequestSchema.safeParse({ requestId: "r1" }).success).toBe(false);
    });
});
