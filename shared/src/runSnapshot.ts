import type { PbsSnapshot, RunSnapshotDetails } from "./types.js";

/**
 * The snapshot a backup run creates, and how to recognise it in what the PBS lists.
 *
 * The agent passes `--backup-id <clientId>` and `--backup-time <epoch>` itself, so it knows
 * the snapshot's name before the CLI starts -- nothing is read back from the CLI's output.
 */

/** The backup type the agent always backs up as. */
export const RUN_SNAPSHOT_BACKUP_TYPE = "host";

/**
 * The file the CLI uploads last. A snapshot without it was never finished: the run that
 * wrote it broke off before the end.
 */
const MANIFEST_FILENAME = "index.json.blob";

/**
 * `host/<clientId>/<time>` in the form the PBS names a snapshot: RFC 3339 in UTC, whole
 * seconds.
 */
export function runSnapshotPath(clientId: string, backupTime: number): string {
    const time = new Date(backupTime * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    return `${RUN_SNAPSHOT_BACKUP_TYPE}/${clientId}/${time}`;
}

/** The epoch seconds in a path from `runSnapshotPath`, or null for anything else. */
export function runSnapshotTime(path: string): number | null {
    const time = path.split("/")[2];
    if (!time) return null;
    const ms = Date.parse(time);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** Whether the PBS lists this snapshot as finished: it has its manifest. */
export function isSnapshotComplete(snapshot: PbsSnapshot): boolean {
    return snapshot.files.some((file) => file.filename === MANIFEST_FILENAME);
}

/** The PBS's kebab-case snapshot in this application's camelCase. */
export function toRunSnapshotDetails(snapshot: PbsSnapshot): RunSnapshotDetails {
    return {
        backupType: snapshot["backup-type"],
        backupId: snapshot["backup-id"],
        backupTime: snapshot["backup-time"],
        files: snapshot.files.map((file) => ({
            filename: file.filename,
            cryptMode: file["crypt-mode"],
            size: file.size,
        })),
        size: snapshot.size,
        owner: snapshot.owner,
        comment: snapshot.comment,
        fingerprint: snapshot.fingerprint,
        protected: snapshot.protected,
    };
}
