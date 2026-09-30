import { spawn } from "child_process";
import type { Writable } from "stream";
import { z } from "zod";
import {
    PbsSnapshotSchema,
    isSnapshotComplete,
    runSnapshotTime,
    toRunSnapshotDetails,
    type RunSnapshotDetails,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { buildSnapshotListArgs } from "./CommandBuilder.js";

/**
 * Reads back the snapshot a backup created, with
 * `proxmox-backup-client snapshot list host/<clientId> --output-format json`.
 *
 * `backup` has no JSON output of its own; `snapshot list` asks the same PBS endpoint the
 * server's snapshot view does, so the details are the PBS's own. Run with the environment
 * of the backup it follows -- repository, fingerprint, password on fd 3 and, for a tunnel
 * job, the same lease. No keyfile: the snapshot metadata is not encrypted.
 */

/** Long enough for a slow PBS, short enough that a hung one does not hold the run open. */
const QUERY_TIMEOUT_MS = 30_000;

/** `snapshot list` prints the list itself; the envelope form is accepted all the same. */
const SnapshotListOutputSchema = z.union([
    z.array(PbsSnapshotSchema),
    z.object({ data: z.array(PbsSnapshotSchema) }).transform((o) => o.data),
]);

export interface SnapshotQueryResult {
    details: RunSnapshotDetails | null;
    /** Why there are no details. Null exactly when `details` is set. */
    error: string | null;
    /**
     * The PBS answered, and the snapshot is not there as a finished one: missing from the
     * list, or listed without its manifest. Unset when the question could not be asked.
     */
    notFinished?: boolean;
}

/**
 * Looks up `snapshot` (`host/<clientId>/<time>`) on the PBS. Never throws: every failure --
 * the process, the timeout, the output, a snapshot that is not there -- ends in `error`.
 */
export async function querySnapshot(spec: {
    snapshot: string;
    command: string;
    env: NodeJS.ProcessEnv;
    password?: string;
}): Promise<SnapshotQueryResult> {
    const backupTime = runSnapshotTime(spec.snapshot);
    if (backupTime === null) {
        return { details: null, error: `Not a snapshot path: ${spec.snapshot}` };
    }

    let output: string;
    try {
        output = await runSnapshotList(spec.command, spec.env, spec.password);
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        logger.warn({ snapshot: spec.snapshot, err: e }, "Snapshot query failed");
        return { details: null, error };
    }

    let json: unknown;
    try {
        json = JSON.parse(output);
    } catch {
        return { details: null, error: "snapshot list returned no valid JSON" };
    }
    const parsed = SnapshotListOutputSchema.safeParse(json);
    if (!parsed.success) {
        return {
            details: null,
            error: `Unexpected snapshot list output: ${parsed.error.issues[0].message}`,
        };
    }

    const match = parsed.data.find((s) => s["backup-time"] === backupTime);
    if (!match) {
        return {
            details: null,
            error: `Snapshot ${spec.snapshot} not found on the PBS`,
            notFinished: true,
        };
    }
    if (!isSnapshotComplete(match)) {
        return {
            details: null,
            error: `Snapshot ${spec.snapshot} has no manifest -- the backup did not finish`,
            notFinished: true,
        };
    }
    return { details: toRunSnapshotDetails(match), error: null };
}

/** Runs the CLI and answers its stdout; rejects on a non-zero exit, an error or the timeout. */
function runSnapshotList(
    command: string,
    env: NodeJS.ProcessEnv,
    password: string | undefined,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, buildSnapshotListArgs(), {
            shell: false,
            env,
            // Same layout as the backup: the repository password goes through fd 3.
            stdio: ["pipe", "pipe", "pipe", "pipe"],
        });
        child.stdin.end();

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
        child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));

        const passwordPipe = child.stdio[3] as Writable;
        passwordPipe.on("error", () => {});
        if (password) passwordPipe.write(password);
        passwordPipe.end();

        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`snapshot list timed out after ${QUERY_TIMEOUT_MS / 1000}s`));
        }, QUERY_TIMEOUT_MS);

        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout);
                return;
            }
            const lastLine = stderr.trim().split("\n").pop();
            reject(
                new Error(
                    `snapshot list exited with code ${code}${lastLine ? `: ${lastLine}` : ""}`,
                ),
            );
        });
    });
}
