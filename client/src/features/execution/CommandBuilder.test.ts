import { beforeEach, describe, expect, it, vi } from "vitest";

// Config reads the agent's config.yaml when it is imported, Identity its registration.
const agent = vi.hoisted(() => ({
    config: { backupParams: undefined as unknown, restoreParams: undefined as unknown },
}));
vi.mock("../../core/Config.js", () => ({ config: agent.config }));
vi.mock("../../core/Identity.js", () => ({ requireClientId: () => "client-1" }));

import {
    backupTimeArgs,
    buildBackupArgs,
    buildRestoreArgs,
    buildSnapshotListArgs,
} from "./CommandBuilder.js";

beforeEach(() => {
    agent.config.backupParams = undefined;
    agent.config.restoreParams = undefined;
});

const archives = [
    { name: "root", path: "/" },
    { name: "home", path: "/home/my files" },
];

describe("buildBackupArgs", () => {
    it("names every archive and this agent as the backup id", () => {
        expect(buildBackupArgs({ archives })).toEqual([
            "backup",
            "root.pxar:/",
            "home.pxar:/home/my files",
            "--backup-id",
            "client-1",
        ]);
    });

    it("passes each exclusion as its own option, after the archives", () => {
        expect(buildBackupArgs({ archives: [archives[0]], excludes: ["/tmp", "*.cache"] })).toEqual([
            "backup",
            "root.pxar:/",
            "--exclude",
            "/tmp",
            "--exclude",
            "*.cache",
            "--backup-id",
            "client-1",
        ]);
    });

    it("puts the keyfile after the subcommand and switches encryption on", () => {
        const args = buildBackupArgs({ archives: [archives[0]] }, { keyfilePath: "/run/key" });

        expect(args[0]).toBe("backup");
        expect(args.slice(-4)).toEqual(["--keyfile", "/run/key", "--crypt-mode", "encrypt"]);
    });

    it("appends the configured extra parameters last", () => {
        agent.config.backupParams = ["--rate", "10MiB"];

        expect(buildBackupArgs({ archives: [archives[0]] }).slice(-2)).toEqual(["--rate", "10MiB"]);
    });

    it("refuses a configured --backup-time, in either spelling", () => {
        agent.config.backupParams = ["--backup-time", "1700000000"];
        expect(() => buildBackupArgs({ archives })).toThrow(/must not contain --backup-time/);

        agent.config.backupParams = ["--backup-time=1700000000"];
        expect(() => buildBackupArgs({ archives })).toThrow(/must not contain --backup-time/);
    });

    it("refuses an archive the CLI would read as an option", () => {
        expect(() => buildBackupArgs({ archives: [{ name: "--keyfile=/etc/shadow", path: "/" }] })).toThrow(
            /would be read as an option/,
        );
    });

    it("builds a command without archives for a job that has none", () => {
        expect(buildBackupArgs({})).toEqual(["backup", "--backup-id", "client-1"]);
    });
});

describe("backupTimeArgs", () => {
    it("is the snapshot time as its own pair", () => {
        expect(backupTimeArgs(1_700_000_000)).toEqual(["--backup-time", "1700000000"]);
    });
});

describe("buildSnapshotListArgs", () => {
    it("lists this agent's own group as JSON", () => {
        expect(buildSnapshotListArgs()).toEqual(["snapshot", "list", "host/client-1", "--output-format", "json"]);
    });
});

describe("buildRestoreArgs", () => {
    const payload = {
        snapshot: "host/client-1/2026-03-10T12:00:00Z",
        archives: ["root.pxar", "home.pxar"],
        targetPath: "/restore/my files",
    } as Parameters<typeof buildRestoreArgs>[0];

    it("restores the first archive of the snapshot to the target", () => {
        expect(buildRestoreArgs(payload)).toEqual([
            "restore",
            "host/client-1/2026-03-10T12:00:00Z",
            "root.pxar",
            "/restore/my files",
        ]);
    });

    it("appends the keyfile and the configured extra parameters", () => {
        agent.config.restoreParams = ["--allow-existing-dirs"];

        expect(buildRestoreArgs(payload, { keyfilePath: "/run/key" }).slice(-3)).toEqual([
            "--keyfile",
            "/run/key",
            "--allow-existing-dirs",
        ]);
    });

    it("throws without an archive instead of sending a malformed command", () => {
        expect(() => buildRestoreArgs({ ...payload, archives: [] })).toThrow(/No archive specified/);
    });

    it("refuses a snapshot, archive or target the CLI would read as an option", () => {
        expect(() => buildRestoreArgs({ ...payload, snapshot: "--repository=evil" })).toThrow(/snapshot/);
        expect(() => buildRestoreArgs({ ...payload, archives: ["--keyfile"] })).toThrow(/archive/);
        expect(() => buildRestoreArgs({ ...payload, targetPath: "-x" })).toThrow(/target path/);
    });
});
